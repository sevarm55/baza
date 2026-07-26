import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db, isServerDb } from './index';

/**
 * Локально миграции применяются сами — чтобы `npm run dev` работал
 * на чистом клоне без единой команды.
 *
 * На сервере — только если явно разрешено через MIGRATE_ON_START.
 * Когда экземпляр приложения один (свой VPS), это самый простой
 * и надёжный вариант. Когда их много (serverless), флаг не ставят,
 * иначе несколько копий начнут мигрировать базу наперегонки —
 * там миграции идут отдельным шагом `npm run db:migrate`.
 */
let applied: Promise<void> | null = null;

function run(): Promise<void> {
  const migrationsFolder = './drizzle';

  if (isServerDb) {
    if (process.env.MIGRATE_ON_START !== '1') return Promise.resolve();
    return migratePostgres(db as unknown as PostgresJsDatabase, { migrationsFolder });
  }

  // сюда попадаем только когда db действительно PGlite: проверка выше
  return migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
}

export function ensureDb(): Promise<void> {
  applied ??= run();
  return applied;
}
