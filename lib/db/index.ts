import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';

/**
 * Локальная база — настоящий Postgres 16, скомпилированный в WASM.
 * Ставить ничего не нужно, файлы лежат в ./.data/pglite.
 *
 * Переезд на сервер (Neon) = замена этих десяти строк на:
 *   import { drizzle } from 'drizzle-orm/neon-http'
 *   export const db = drizzle(process.env.DATABASE_URL!, { schema })
 * Схема, миграции и все запросы остаются как есть — диалект тот же.
 */

const globalForDb = globalThis as unknown as { __pglite?: PGlite };

const dataDir = process.env.PGLITE_DIR ?? './.data/pglite';

// PGlite не создаёт директорию данных сам и падает с ENOENT на чистом
// клоне репозитория. Пустая папка для него — сигнал инициализировать базу.
if (!dataDir.startsWith('memory://')) {
  mkdirSync(dataDir, { recursive: true });
}

const client = globalForDb.__pglite ?? new PGlite(dataDir);

// в dev Next перезагружает модули на каждое изменение — держим одно соединение
if (process.env.NODE_ENV !== 'production') globalForDb.__pglite = client;

export const db = drizzle(client, { schema });
export { schema };
export const pg = client;
