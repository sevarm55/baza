import { cookies } from 'next/headers';

import { AdminShell } from '@/components/admin/shell';
import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { attentionList } from '@/lib/admin-queries';
import { listTenantsForAdmin } from '@/lib/queries';

/**
 * Каркас админки. Права проверяются здесь, один раз на все страницы
 * раздела, и ещё раз в каждом действии: забыть проверку в новой
 * странице легко, а последствие чужие деньги на экране постороннего.
 */
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin();
  await ensureDb();

  const list = await listTenantsForAdmin();
  const attention = attentionList(list).length;
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  return (
    <AdminShell
      who={ctx.admin.name}
      role={ctx.role}
      counts={{ attention, businesses: list.length }}
      sidebarOpen={sidebarOpen}
    >
      {children}
    </AdminShell>
  );
}
