import { mkdirSync } from 'node:fs';
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

function createClient() {
  const url = process.env.DATABASE_URL;

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

  const dataDir = process.env.PGLITE_DIR ?? './.data/pglite';
  // PGlite не создаёт директорию данных сам и падает с ENOENT на чистом
  // клоне репозитория. Пустая папка для него — сигнал инициализировать базу.
  if (!dataDir.startsWith('memory://')) mkdirSync(dataDir, { recursive: true });

  const client = globalForDb.__pglite ?? new PGlite(dataDir);
  if (process.env.NODE_ENV !== 'production') globalForDb.__pglite = client;
  return { kind: 'pglite' as const, client };
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
