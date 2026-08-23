import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ACTIVE_NICHES } from '@/lib/niches';
import { getSession } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { getDict } from '@/lib/i18n/server';
import { nicheNameTerm, nicheTagTerm } from '@/lib/i18n/terms';

/**
 * Выбор ниши перед регистрацией.
 *
 * Пока открыта одна ниша, экран лишний шаг между желанием и
 * регистрацией, и страница сразу уводит на `/start/:niche`. Вернётся
 * сама, как только включим вторую.
 */
export default async function StartPage() {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  if (ACTIVE_NICHES.length === 1) redirect(`/start/${ACTIVE_NICHES[0].key}`);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pt-12 pb-24">
      <header className="flex flex-col items-center gap-4 text-center">
        <Logo size={28} />
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
            {t.onboarding.chooseNiche}
          </h1>
          <p className="text-sm text-muted-foreground">{t.onboarding.chooseNicheSub}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {ACTIVE_NICHES.map((n) => (
          <Link
            key={n.key}
            href={`/start/${n.key}`}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="text-sm font-semibold">{nicheNameTerm(n.name, t.locale)}</span>
            <span className="text-xs leading-snug text-muted-foreground">
              {nicheTagTerm(n.tag, t.locale)}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t.auth.signInTitle}
        </Link>
      </p>
    </main>
  );
}
