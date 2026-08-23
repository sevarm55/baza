import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { currentAccess } from '@/lib/subscription';
import { getAlerts } from '@/lib/alerts';
import { passesEnabled } from '@/lib/features';
import { getSetup } from '@/lib/onboarding';
import { getDict } from '@/lib/i18n/server';
import { unitForms } from '@/lib/i18n/terms';
import { AppShell } from '@/components/shell/app-shell';

/**
 * Оболочка кабинета владельца.
 *
 * Здесь проверяется доступ (сессия, роль, подписка), считаются поводы
 * для колокольчика и следующий шаг настройки: колонка и полоса стоят на
 * каждой странице, и их числа должны совпадать с тем, что человек
 * увидит внутри, на какой бы странице он ни нажал.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/session-ended');
  // отключённый бизнес не пускаем внутрь вообще
  const access = currentAccess(tenant);
  if (!access.canRead) redirect('/blocked');

  const points = me.accountId ? await listPoints(me.accountId) : [];
  const passes = passesEnabled();

  const alerts = await getAlerts(tenant.id, me.id, tenant.timezone, t.locale);
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  /* Следующий шаг настройки: одна точка в колонке, пока она не
     закончена. Считается тем же кодом, что и блок на главной. */
  const setup = await getSetup(tenant, me);
  const hint = setup.visible ? (setup.next?.href ?? null) : null;

  return (
    <AppShell
      tenantName={tenant.name}
      userName={me.name}
      points={points}
      currentTid={tenant.id}
      passes={passes}
      active="owner"
      alerts={alerts}
      hint={hint}
      access={access}
      sidebarOpen={sidebarOpen}
      quickAdd={`${unitForms(tenant.unitOne, t.locale).acc}`}
    >
      {children}
    </AppShell>
  );
}
