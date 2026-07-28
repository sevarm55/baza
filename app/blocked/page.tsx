import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
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
  if (!tenant) redirect('/session-ended');

  // сюда попадают только отключённые: остальных возвращаем в приложение
  if (currentAccess(tenant).canRead) {
    redirect(session.role === 'owner' ? '/owner' : '/work');
  }

  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-[14px] border border-bad-line bg-bad-bg p-5">
        <h1 className="mb-2 text-[19px] font-semibold text-bad-ink">
          {hy.billing.blockedTitle}
        </h1>
        <p className="text-[14px] leading-relaxed text-muted">{hy.billing.blockedText}</p>
        <p className="mt-3 text-[14px] text-bad-ink">{hy.billing.renew}</p>
      </div>

      <div className="mt-5 flex items-center justify-between px-1">
        <span className="text-[13px] text-faint">{tenant.name}</span>
        <SignOutButton />
      </div>
    </main>
  );
}
