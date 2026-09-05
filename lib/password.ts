import { randomInt } from 'node:crypto';

import { hashPin, needsRehash as needsRehashCore, verifyPin } from './pin';

/**
 * Пароли.
 *
 * Хеширование не своё: тот же scrypt и тот же версионированный формат,
 * что раньше держал PIN (`lib/pin.ts`). Заводить второй способ хранить
 * секрет ради того, что секрет стал длиннее, значило бы держать два
 * набора параметров и два пути обновления вместо одного.
 *
 * Отдельный модуль нужен не ради алгоритма, а ради правил: у пароля
 * есть длина, есть выдача владельцем и есть перенос со старого хеша.
 * Всё это к шести цифрам отношения не имело.
 */

/**
 * Нижняя граница длины.
 *
 * Восемь, а не двенадцать. Пароль здесь придумывает не разработчик, а
 * хозяин мойки, и придумывает его на телефоне: требование в двенадцать
 * знаков со спецсимволами он выполнит одним способом — напишет
 * `Password1!` и запишет на бумажке у кассы. Восемь без правил о составе
 * плюс дорогой хеш и счётчик попыток на входе дают больше, чем
 * невыполнимое требование.
 */
export const PASSWORD_MIN = 8;

/** Верхняя граница: строку длиннее незачем гонять через дорогой scrypt. */
export const PASSWORD_MAX = 128;

export type PasswordProblem = 'short' | 'long' | 'common';

/**
 * Пароли, которые запрещены при любой длине.
 *
 * Список короткий намеренно. Он закрывает не перебор по словарю — от
 * него защищает хеш, — а первую мысль человека, которому сказали
 * «придумайте пароль». Длинный список ловил бы редкое и раздражал бы
 * на каждом шаге.
 */
const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'qwerty123',
  'qwertyui',
  'parol123',
  'password1',
  'iloveyou',
  '11111111',
  '00000000',
]);

/** Что не так с паролем; `null` — всё в порядке. */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return 'short';
  if (password.length > PASSWORD_MAX) return 'long';
  if (COMMON.has(password.toLowerCase())) return 'common';
  return null;
}

/** Хеш пароля. Формат общий с прежним PIN, см. `lib/pin.ts`. */
export async function hashPassword(password: string): Promise<string> {
  return hashPin(password);
}

/**
 * Сверка. Пустой хеш не проходит никогда: у сотрудника, которому пароль
 * ещё не выдали, в базе `null`, и такой не должен входить по пустой
 * строке.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  return verifyPin(password, stored);
}

/** Пора ли пересчитать хеш новыми параметрами. */
export function needsRehash(stored: string): boolean {
  return needsRehashCore(stored);
}

/**
 * Алфавит для выданного пароля.
 *
 * Без `0 O o 1 l I` и без похожих пар: этот пароль владелец диктует
 * мойщику вслух или пишет на бумажке, и «ноль или буква О» — самая
 * частая причина, по которой человек не может войти с первого раза.
 * Букв и цифр хватает: случайность даёт длина, а не разнообразие знаков.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Длина выданного пароля: десять знаков этого алфавита это ~57 бит. */
const GENERATED_LENGTH = 10;

/**
 * Пароль, который владелец выдаёт сотруднику.
 *
 * Читается вслух и набирается на телефоне, поэтому знаки препинания
 * сюда не берутся вовсе: на армянской раскладке их ищут дольше, чем
 * набирают весь пароль.
 */
export function generatePassword(length = GENERATED_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
