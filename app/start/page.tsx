import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NICHE_LIST } from '@/lib/niches';
import { getSession } from '@/lib/auth';
import { hy } from '@/lib/i18n/hy';

export default async function StartPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pb-24">
      <header className="pt-11 pb-2 text-center">
        <div className="mb-3.5 text-[13px] font-bold tracking-[3px] text-accent">
          {hy.app.name.toUpperCase()}
        </div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
          {hy.onboarding.chooseNiche}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{hy.onboarding.chooseNicheSub}</p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {NICHE_LIST.map((n) => (
          <Link
            key={n.key}
            href={`/start/${n.key}`}
            className="card transition hover:-translate-y-0.5 hover:border-accent"
          >
            <span className="mb-2 block text-[26px]">{n.icon}</span>
            <div className="font-semibold">{n.name}</div>
            <div className="mt-1 text-xs leading-snug text-muted">{n.tag}</div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="underline underline-offset-4 hover:text-ink">
          {hy.auth.signInTitle}
        </Link>
      </p>
    </main>
  );
}
