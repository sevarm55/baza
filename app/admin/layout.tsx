import { requirePlatformAdmin } from '@/lib/admin';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf } from '@/lib/subscription';
import { Sidebar, type NavItem } from './sidebar';
import s from './shell.module.css';

/**
 * Каркас админки.
 *
 * Права проверяются здесь, один раз на все страницы раздела: забыть
 * проверку в новой странице легко, а последствие — чужие деньги на
 * экране постороннего.
 *
 * Счётчики в меню считаются тут же. Дублирование запроса с главной
 * страницей осознанное: бизнесов десятки, запрос дешёвый, а число
 * просроченных рядом с пунктом избавляет от захода внутрь ради «а есть
 * ли там что-нибудь».
 */
export const metadata = { title: 'Tetrin · Админ' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  const rows = (await listTenantsForAdmin()).map((t) => accessOf(t).state);
  const overdue = rows.filter((x) => x === 'expired' || x === 'blocked').length;

  const items: NavItem[] = [
    { href: '/admin', label: 'Клиенты', icon: '◍', count: rows.length, also: '/admin/t/' },
    { href: '/admin/payments', label: 'Платежи', icon: '֏' },
    { href: '/admin/attention', label: 'Внимание', icon: '!', count: overdue },
    { href: '/admin/journal', label: 'Журнал', icon: '≡' },
  ];

  return (
    <div className={s.shell}>
      <Sidebar items={items} who={admin.name} />
      <main className={s.main}>{children}</main>
    </div>
  );
}
