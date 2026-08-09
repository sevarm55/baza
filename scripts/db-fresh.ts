/**
 * Пересобрать локальную базу с нуля. Запуск: npm run db:fresh
 *
 * Работаем на настоящем Postgres в докере (`infra/dev-db.yml`), а не на
 * PGlite. Причина простая: PGlite — файловая база одного процесса.
 * Стоит открыть её вторым — сидером, скриптом, второй вкладкой
 * `npm run dev` — и она портится молча, а потом каждый запрос отвечает
 * «Aborted()». Чинить это нечем, только пересоздавать. За день такого
 * набирается больше, чем стоит вся экономия на докере.
 *
 * PGlite остаётся запасным вариантом «клонировал и запустил»: если
 * DATABASE_URL не задан, всё работает как раньше.
 *
 * Здесь схема сносится и накатывается заново, а сверху ложится тот же
 * демо-бизнес, что уезжает на сервер для ревью App Store: одни и те же
 * данные и там, и здесь.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV = '.env.local';
const URL = 'postgres://tetr:tetr@127.0.0.1:5433/tetr';

async function main() {
  ensureEnv();
  process.env.DATABASE_URL = URL;

  const { default: postgres } = await import('postgres');
  const sql = postgres(URL, { max: 1, prepare: false });

  try {
    /* Сносим схему целиком, а не таблицы по списку: список отстаёт от
       схемы ровно тогда, когда это важнее всего. Вместе с public уходит
       и служебная схема drizzle с журналом миграций. */
    await sql.unsafe('drop schema if exists public cascade');
    await sql.unsafe('drop schema if exists drizzle cascade');
    await sql.unsafe('create schema public');
    console.log('схема очищена');
  } finally {
    await sql.end();
  }

  /* Мигратор зовём напрямую, а не через ensureDb: на серверной базе он
     молчит без MIGRATE_ON_START, и схема осталась бы пустой. */
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const runner = postgres(URL, { max: 1, prepare: false });
  try {
    await migrate(drizzle(runner), { migrationsFolder: './drizzle' });
  } finally {
    await runner.end();
  }
  console.log('миграции применены');

  /* Демо-бизнес готовится тем же скриптом, что и для сервера: он
     печатает SQL, мы его вливаем. */
  const seed = execFileSync('npx', ['tsx', 'scripts/demo-account.ts'], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: URL },
  });

  const client = postgres(URL, { max: 1, prepare: false });
  try {
    await client.unsafe(seed);
  } finally {
    await client.end();
  }

  console.log('демо-бизнес залит');
  console.log('');
  console.log('  вход:  +374 99 000 000 · PIN 2468   — владелец');
  console.log('         +374 99 000 001 · PIN 1357   — мойщик');
  console.log('');
}

/**
 * Адрес базы в .env.local.
 *
 * Файл в гите не лежит, и у каждого он свой. Дописываем строку, если её
 * нет, и не трогаем остальное: там могут быть чужие ключи.
 */
function ensureEnv() {
  const before = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
  if (before.includes('DATABASE_URL=')) return;

  const line = `# Локальный Postgres из infra/dev-db.yml — см. npm run db:up\nDATABASE_URL=${URL}\n`;
  writeFileSync(ENV, before ? `${before.replace(/\n*$/, '\n')}\n${line}` : line);
  console.log(`${ENV}: прописан DATABASE_URL`);
}

main().catch((e) => {
  console.error(e);
  console.error('');
  console.error('база не поднята? запустите: npm run db:up');
  process.exit(1);
});
