import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Два режима, одна схема и одни запросы.
 *
 *   есть DATABASE_URL  → настоящий Postgres (сервер)
 *   нет DATABASE_URL   → PGlite, тот же Postgres 16 в WASM (локально)
 *
 * Диалект один и тот же, поэтому переключение ничего не ломает: миграции,
 * схема и все запросы остаются как есть.
 *
 * Драйвер выбран не случайно: postgres-js умеет транзакции, а
 * neon-http — нет. У нас каждая запись и каждый расчёт зарплаты идут
 * в транзакции, без них счётчики разъедутся.
 */

const globalForDb = globalThis as unknown as {
  __pglite?: PGlite;
  __pg?: ReturnType<typeof postgres>;
};

/* Интеграции хостингов называют переменную по-разному: Neon через Vercel
   ставит DATABASE_URL, старые шаблоны Vercel Postgres — POSTGRES_URL.
   Принимаем оба, чтобы деплой не падал из-за названия. */
function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

function createClient() {
  const url = databaseUrl();

  if (url) {
    const client =
      globalForDb.__pg ??
      postgres(url, {
        // на serverless держать много соединений нельзя: пул кончится
        // быстрее, чем закончится трафик
        max: 1,
        idle_timeout: 20,
        // Supabase/Neon работают через пулер, где prepared statements ломаются
        prepare: false,
      });
    if (process.env.NODE_ENV !== 'production') globalForDb.__pg = client;
    return { kind: 'postgres' as const, client };
  }

  /* Сборка идёт в полтора десятка воркеров, и каждый поднимает свою
     PGlite. Если пустить их всех в один каталог, файлы базы рвутся —
     запросы начинают отвечать «Aborted()», и локальные данные теряются.
     Данные при сборке никому не нужны (все маршруты динамические),
     поэтому на это время база живёт в памяти. */
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  const dataDir = building ? 'memory://' : (process.env.PGLITE_DIR ?? './.data/pglite');

  // PGlite не создаёт директорию данных сам и падает с ENOENT на чистом
  // клоне репозитория. Пустая папка для него — сигнал инициализировать базу.
  if (!dataDir.startsWith('memory://')) {
    mkdirSync(dataDir, { recursive: true });
    claimDataDir(dataDir);
  }

  const client = globalForDb.__pglite ?? new PGlite(dataDir);
  if (process.env.NODE_ENV !== 'production') globalForDb.__pglite = client;
  return { kind: 'pglite' as const, client };
}

/**
 * Занять каталог базы за собой.
 *
 * PGlite — встроенный Postgres, и каталог данных принадлежит ровно
 * одному процессу. Второй, открывший тот же каталог, не получает отказа:
 * он спокойно пишет поверх, файлы расходятся, и дальше КАЖДЫЙ запрос
 * отвечает «RuntimeError: Aborted()». Со стороны это выглядит как
 * внезапно сломавшийся сайт, хотя сломана база — и чинится только
 * пересозданием.
 *
 * Ловушка расставлена буквально везде: `npm run dev` в двух окнах, seed
 * при живом сервере, `tsx scripts/...` рядом с открытым кабинетом.
 * Своего замка у PGlite нет — `postmaster.pid` она пишет с фиктивным
 * номером (-42), по нему живой процесс не найти.
 *
 * Поэтому замок здесь свой: файл с настоящим PID. Живой хозяин —
 * внятная ошибка вместо порчи; мёртвый (упал, убит) — замок забираем и
 * работаем дальше.
 */
function claimDataDir(dataDir: string) {
  const lock = join(dataDir, '.owner.lock');

  try {
    const owner = Number(readFileSync(lock, 'utf8').trim());
    if (Number.isInteger(owner) && owner > 0 && owner !== process.pid && alive(owner)) {
      throw new Error(
        `Каталог базы ${dataDir} уже открыт процессом ${owner}.\n` +
          'PGlite не переносит двух хозяев: второй молча портит файлы, и после этого\n' +
          'каждый запрос отвечает «Aborted()».\n' +
          'Закройте тот процесс (обычно это запущенный `npm run dev`) и повторите.\n' +
          'Если база уже испорчена — `npm run db:fresh` пересоздаст её с демо-данными.',
      );
    }
  } catch (e) {
    // нет файла — каталог свободен; своя же ошибка уходит наверх
    if (e instanceof Error && e.message.startsWith('Каталог базы')) throw e;
  }

  writeFileSync(lock, String(process.pid));
  // отпускаем при нормальном выходе; после kill -9 замок снимет проверка выше
  process.once('exit', () => {
    try {
      if (Number(readFileSync(lock, 'utf8').trim()) === process.pid) unlinkSync(lock);
    } catch {
      // каталог уже унесли — отпускать нечего
    }
  });
}

/** Жив ли процесс: сигнал 0 ничего не делает, но проверяет существование. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM — процесс есть, но чужой: тоже живой
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const created = createClient();

export const isServerDb = created.kind === 'postgres';

/* Типы у драйверов разные, API — одинаковый. Приводим к типу серверного,
   чтобы весь остальной код не знал, где он сейчас работает. */
export const db = (
  created.kind === 'postgres'
    ? drizzlePostgres(created.client, { schema })
    : drizzlePglite(created.client, { schema })
) as ReturnType<typeof drizzlePostgres<typeof schema>>;

export { schema };
