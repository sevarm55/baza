/**
 * Хеш пароля админки. Запуск:
 *   npx tsx scripts/admin-password.ts 'мой-длинный-пароль'
 *
 * Результат кладётся в окружение сервера как ADMIN_PASSWORD_HASH, и
 * тогда открытый пароль нигде не хранится. Алгоритм тот же scrypt, что
 * у PIN-кодов продукта (lib/pin.ts): новой криптографии здесь нет.
 */
import { hashPin } from '../lib/pin';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Дайте пароль аргументом, не короче 8 знаков.');
  process.exit(1);
}

hashPin(password).then((hash) => {
  console.log(`ADMIN_PASSWORD_HASH='${hash}'`);
});
