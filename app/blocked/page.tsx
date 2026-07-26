import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant } from '@/lib/queries';
import { accessOf } from '@/lib/subscription';
import { hy } from '@/lib/i18n/hy';
import { SignOutButton } from '@/components/sign-out-button';

/**
 * Экран отключённого бизнеса.
 *
 * Говорит главное: данные целы. Человек, которому закрыли доступ,
 * первым делом боится потерять свою историю — и если не ответить
 * на этот страх сразу, он не вернётся даже заплатив.
 */
export default async function BlockedPage() {
  const session = await requireSession();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

  // сюда попадают только отключённые: остальных возвращаем в приложение
  if (accessOf(tenant).canRead) {
    redirect(session.role === 'owner' ? '/owner' : '/work');
  }

  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-[14px] border border-[#6b2b31] bg-[#2a1416] p-5">
        <h1 className="mb-2 text-[19px] font-semibold text-[#ffb4b8]">
          {hy.billing.blockedTitle}
        </h1>
        <p className="text-[14px] leading-relaxed text-muted">{hy.billing.blockedText}</p>
        <p className="mt-3 text-[14px] text-[#ffb4b8]">{hy.billing.renew}</p>
      </div>

      <div className="mt-5 flex items-center justify-between px-1">
        <span className="text-[13px] text-faint">{tenant.name}</span>
        <SignOutButton />
      </div>
    </main>
  );
}
