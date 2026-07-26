import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { getUser } from './queries';
import { normalizePhone } from './phone';

/**
 * Доступ к админке платформы.
 *
 * Отдельного пароля намеренно нет: второй способ входа — это второе место,
 * где можно ошибиться. Админ заходит обычным телефоном и PIN, а право
 * даётся списком номеров в переменной окружения PLATFORM_ADMIN_PHONES.
 *
 * Список лежит на сервере, а не в базе: чтобы выдать себе доступ, мало
 * добраться до базы — нужен доступ к настройкам сервера.
 */

function adminPhones(): string[] {
  return (process.env.PLATFORM_ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean);
}

export async function getPlatformAdmin() {
  const session = await getSession();
  if (!session) return null;

  const user = await getUser(session.tid, session.uid);
  if (!user) return null;

  return adminPhones().includes(user.phone) ? user : null;
}

export async function requirePlatformAdmin() {
  const admin = await getPlatformAdmin();
  // не 403, а 404-подобный редирект: посторонний не должен даже узнать,
  // что по этому адресу что-то есть
  if (!admin) redirect('/');
  return admin;
}
