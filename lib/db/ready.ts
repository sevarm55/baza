import { migrate } from 'drizzle-orm/pglite/migrator';
import { db } from './index';

/**
 * Миграции применяются один раз за процесс.
 * На PGlite это дёшево, а на сервере этот файл заменится на шаг деплоя.
 */
let applied: Promise<void> | null = null;

export function ensureDb(): Promise<void> {
  applied ??= migrate(db, { migrationsFolder: './drizzle' });
  return applied;
}
