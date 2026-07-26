import { migrate } from 'drizzle-orm/pglite/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { db, isServerDb } from './index';

/**
 * Локально миграции применяются сами — чтобы `npm run dev` работал
 * на чистом клоне без единой команды.
 *
 * На сервере — нет, и это осознанно: параллельные лямбды начали бы
 * мигрировать одну базу наперегонки. Там миграции идут отдельным шагом
 * при деплое (`npm run db:migrate`).
 */
let applied: Promise<void> | null = null;

export function ensureDb(): Promise<void> {
  if (isServerDb) return Promise.resolve();
  // сюда попадаем только когда db действительно PGlite: проверка выше
  applied ??= migrate(db as unknown as PgliteDatabase, {
    migrationsFolder: './drizzle',
  });
  return applied;
}
