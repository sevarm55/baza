import { requirePlatformAdmin } from '@/lib/admin';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf } from '@/lib/subscription';
import { Sidebar, type NavItem } from './sidebar';

/**
 * Каркас админки.
 *
 * Права проверяются здесь, один раз на все страницы раздела: забыть
 * проверку в новой странице легко, а последствие чужие деньги на экране
 * постороннего.
 *
 * Счётчики в меню считаются тут же. Дублирование запроса с главной
 * страницей осознанное: бизнесов десятки, запрос дешёвый, а число
 * просроченных рядом с пунктом избавляет от захода внутрь.
 */
export const metadata = { title: 'Tetrin · Админ' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  const rows = (await listTenantsForAdmin()).map((t) => accessOf(t).state);
  const overdue = rows.filter((x) => x === 'expired' || x === 'blocked').length;

  const items: NavItem[] = [
    { href: '/admin', label: 'Клиенты', icon: 'tenants', count: rows.length, also: '/admin/t/' },
    { href: '/admin/payments', label: 'Платежи', icon: 'payments' },
    { href: '/admin/attention', label: 'Внимание', icon: 'attention', count: overdue },
    { href: '/admin/journal', label: 'Журнал', icon: 'journal' },
  ];

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <Sidebar items={items} who={admin.name} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
