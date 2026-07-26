/**
 * Применение миграций к серверной базе. Запуск:
 *   npm run db:migrate
 *
 * Отдельный шаг, а не автоматика при старте: несколько экземпляров
 * приложения начали бы мигрировать одну базу одновременно.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL не задан — мигрировать нечего.');
  console.error('Локальная база (PGlite) мигрируется сама при запуске.');
  process.exit(1);
}

async function main() {
  // на миграции нужно прямое соединение и один клиент
  const client = postgres(url!, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('миграции применены');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
