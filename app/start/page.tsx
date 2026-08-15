import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ACTIVE_NICHES } from '@/lib/niches';
import { getSession } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { getDict } from '@/lib/i18n/server';
import { nicheNameTerm, nicheTagTerm } from '@/lib/i18n/terms';

export default async function StartPage() {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  // Пока открыта одна ниша, экран выбора — лишний шаг между желанием
  // и регистрацией. Вернётся сам, как только включим вторую.
  if (ACTIVE_NICHES.length === 1) redirect(`/start/${ACTIVE_NICHES[0].key}`);

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pb-24">
      <header className="pt-11 pb-2 text-center">
        <Logo size={28} className="mb-4" />
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
          {t.onboarding.chooseNiche}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t.onboarding.chooseNicheSub}</p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {ACTIVE_NICHES.map((n) => (
          <Link
            key={n.key}
            href={`/start/${n.key}`}
            className="card border border-line transition hover:border-ink"
          >
            <div className="text-[15px] font-semibold">{nicheNameTerm(n.name, t.locale)}</div>
            <div className="mt-1.5 text-[13px] leading-snug text-muted">
              {nicheTagTerm(n.tag, t.locale)}
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="underline underline-offset-4 hover:text-ink">
          {t.auth.signInTitle}
        </Link>
      </p>
    </main>
  );
}
