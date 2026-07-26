import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { TopBar } from '@/components/top-bar';
import { OwnerTabs } from '@/components/owner-tabs';
import { BillingBanner } from '@/components/billing-banner';
import { accessOf } from '@/lib/subscription';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/login');

  return (
    <>
      <TopBar tenantName={tenant.name} subtitle={me.name} role="owner" active="owner" />
      <main className="mx-auto w-full max-w-[760px] px-4 pb-24">
        <OwnerTabs />
        <BillingBanner access={accessOf(tenant)} role="owner" />
        {children}
      </main>
    </>
  );
}
