import { scrypt as _scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Хранение PIN.
 *
 * Отдельный модуль без зависимостей от Next: нужен и в запросе, и в
 * скриптах сидинга.
 *
 * PIN — шесть цифр, миллион комбинаций. Само по себе это немного, и
 * защищать код только его длиной нельзя: настоящую защиту дают счётчик
 * попыток на входе и подтверждение с незнакомого устройства. Но хеш
 * обязан быть дорогим на случай, когда база уже утекла и счётчик попыток
 * больше ничего не значит — там между «миллион вариантов за секунду» и
 * «миллион вариантов за неделю» лежит вся разница.
 *
 * Алгоритм — scrypt из стандартной библиотеки Node. Не Argon2id: его в
 * Node нет, а нативная зависимость ради этого притащила бы в образ
 * компилятор и обновления, которые придётся сторожить. Своей криптографии
 * здесь нет ни строчки — только вызов проверенной функции с явными
 * параметрами.
 *
 * ФОРМАТ ХЕША ВЕРСИОНИРОВАН:
 *
 *   s2$N$r$p$salt$key   — текущий
 *   salt:key            — прежний, scrypt с параметрами Node по умолчанию
 *
 * Прежний остаётся ЧИТАЕМЫМ навсегда, иначе выкат отобрал бы доступ у
 * всех, кто уже зарегистрирован. Строки переезжают сами: код сверяется
 * при входе, и вызывающий, увидев `needsRehash`, пересчитывает хеш новым
 * алгоритмом. Открытого PIN для этого не требуется хранить нигде — он
 * есть в руках ровно в тот момент, когда его и так проверяют.
 */

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/* Параметры текущей версии.

   N=32768, r=8, p=1 — это ~32 МБ памяти и порядка 60–90 мс на серверном
   ядре. Вдвое дороже прежнего умолчания Node (16384). Выше поднимать
   нельзя не из скупости: scrypt держит N·r·128 байт НА КАЖДЫЙ
   параллельный вход, и 64 МБ × десяток одновременных попыток кладут
   контейнер быстрее любого перебора. Счётчик попыток на входе как раз и
   существует, чтобы этот компромисс был допустимым. */
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;
/* maxmem задаём явно: умолчание Node — 32 МБ, ровно на границе, и при
   N=32768 вызов падает с «Invalid scrypt params» вместо того, чтобы
   работать. Падение хеширования выглядит как «неверный PIN у всех». */
const MAXMEM = 128 * 1024 * 1024;

/**
 * У человека нет кода вовсе.
 *
 * Так живут те, кто завёл мойку по коду из SMS: PIN им не нужен, входят
 * они кодом. Колонка `pin_hash` при этом объявлена NOT NULL, и менять
 * схему ради нового пути значило бы трогать её у всех, включая тех, у
 * кого код есть и работает.
 *
 * Метка, а не случайный хеш. Случайный вёл себя бы точно так же при
 * сверке — не подошёл бы никогда, — но по нему нельзя отличить «кода
 * нет» от «код есть, просто вы его не знаете». А отличать надо: в
 * профиле у одного стоит «сменить PIN» и вопрос про текущий, у другого
 * «задать PIN» и никакого вопроса, потому что спрашивать нечего.
 */
export const NO_PIN = 'none';

/**
 * Есть ли у человека код.
 *
 * Пустой хеш допускается с тех пор, как продукт перешёл на пароли: у
 * заведённого после перехода в `pin_hash` лежит `null`, и это не
 * поломка, а нормальное состояние. Отвечает «нет», и всё, что дальше,
 * останавливается само.
 */
export function hasPin(stored: string | null | undefined): stored is string {
  return typeof stored === 'string' && stored !== NO_PIN && stored.length > 0;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(pin, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `s2$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

type Parsed = { N: number; r: number; p: number; salt: Buffer; key: Buffer; legacy: boolean };

function parse(stored: string): Parsed | null {
  if (stored.startsWith('s2$')) {
    const [, n, r, p, saltHex, keyHex] = stored.split('$');
    const parsed = { N: Number(n), r: Number(r), p: Number(p) };
    if (!Number.isInteger(parsed.N) || !Number.isInteger(parsed.r) || !Number.isInteger(parsed.p)) {
      return null;
    }
    if (!saltHex || !keyHex) return null;
    return {
      ...parsed,
      salt: Buffer.from(saltHex, 'hex'),
      key: Buffer.from(keyHex, 'hex'),
      legacy: false,
    };
  }

  // прежний формат: соль и ключ через двоеточие, параметры Node по умолчанию
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return null;
  return {
    N: 16384,
    r: 8,
    p: 1,
    salt: Buffer.from(saltHex, 'hex'),
    key: Buffer.from(keyHex, 'hex'),
    legacy: true,
  };
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  // кода нет — значит не подходит ничего
  if (!hasPin(stored)) return false;

  const parsed = parse(stored);
  if (!parsed || parsed.key.length === 0) return false;

  let key: Buffer;
  try {
    key = await scrypt(pin, parsed.salt, parsed.key.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAXMEM,
    });
  } catch {
    // испорченная строка в базе — это «не подошло», а не пятисотка
    return false;
  }

  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/**
 * Пора ли пересчитать хеш этим PIN.
 *
 * Спрашивается ТОЛЬКО после удачной сверки: до неё открытого PIN у нас
 * нет, а без него пересчитать нечего. Возвращает true и для прежнего
 * формата, и для строк, посчитанных более слабыми параметрами, — так
 * подъём стоимости в будущем не потребует ни миграции, ни скрипта.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.legacy || parsed.N < N || parsed.r < R || parsed.p < P;
}

/**
 * Сколько стоит одна проверка — для тестов и для подбора параметров.
 * В рабочем коде не используется.
 */
export const PIN_HASH_PARAMS = { N, r: R, p: P, keylen: KEYLEN } as const;
