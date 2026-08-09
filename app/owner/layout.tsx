import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { TopBar } from '@/components/top-bar';
import { OwnerTabs } from '@/components/owner-tabs';
import { Rail } from '@/components/rail';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { passesEnabled } from '@/lib/features';

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

  /* Два способа показать одно и то же.

     На компьютере кабинет — рабочая панель: разделы стоят слева
     неподвижно, полотно занимает всё остальное. На телефоне схема
     складывается в столбец с шапкой и полосой вкладок: продукт живёт
     там в PWA, и прежний порядок был для него верным.

     Переключает не состояние, а ширина окна: обе разметки лежат в
     дереве всегда, и переход между ними ничего не перезагружает. */
  return (
    <div className="shell">
      <Rail
        tenantName={tenant.name}
        userName={me.name}
        points={points}
        currentTid={tenant.id}
        passes={passes}
        active="owner"
      />

      <div className="min-w-0">
        <div className="lg:hidden">
          <TopBar
            tenantName={tenant.name}
            subtitle={me.name}
            role="owner"
            active="owner"
            points={points}
            currentTid={tenant.id}
          />
        </div>

        <main className="canvas">
          <div className="canvas-inner">
            <div className="lg:hidden">
              <OwnerTabs passes={passes} />
            </div>
            <BillingBanner access={currentAccess(tenant)} role="owner" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
