import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { Rail } from '@/components/rail';
import { Logo } from '@/components/logo';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { getAlerts } from '@/lib/alerts';
import { passesEnabled } from '@/lib/features';
import { hy } from '@/lib/i18n/hy';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/session-ended');
  // отключённый бизнес не пускаем внутрь вообще
  if (!currentAccess(tenant).canRead) redirect('/blocked');

  const points = me.accountId ? await listPoints(me.accountId) : [];
  const passes = passesEnabled();

  /* Поводы считаются здесь, в раскладке: колокольчик стоит на каждой
     странице кабинета, и число на нём должно совпадать с тем, что
     человек увидит внутри, на какой бы странице он ни нажал. */
  const alerts = await getAlerts(tenant.id, me.id, tenant.timezone);
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  /* Два способа показать одно и то же.

     На компьютере кабинет — рабочая панель: разделы стоят слева
     неподвижно, полотно занимает всё остальное. На телефоне схема
     складывается в столбец с шапкой и полосой вкладок: продукт живёт
     там в PWA, и прежний порядок был для него верным.

     Переключает не состояние, а ширина окна: обе разметки лежат в
     дереве всегда, и переход между ними ничего не перезагружает. */
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Rail
        tenantName={tenant.name}
        userName={me.name}
        points={points}
        currentTid={tenant.id}
        passes={passes}
        active="owner"
        alerts={alerts}
      />

      <SidebarInset className="min-w-0 bg-board text-[color:var(--on-board)]">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/92 px-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={hy.common.expand} title={hy.common.expand} />
          <Logo size={24} withName={false} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{tenant.name}</div>
            <div className="truncate text-[11.5px] text-sidebar-foreground/55">{me.name}</div>
          </div>
        </header>

        <div className="canvas">
          <div className="canvas-inner">
            <BillingBanner access={currentAccess(tenant)} role="owner" />
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
