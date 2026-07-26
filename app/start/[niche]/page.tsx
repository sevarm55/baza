import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NICHES, type NicheKey } from '@/lib/niches';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { RegisterForm } from './register-form';

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const { niche: key } = await params;
  const niche = NICHES[key as NicheKey];
  if (!niche) notFound();

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pb-24">
      <header className="pt-8 pb-5">
        <Link href="/start" className="text-sm text-muted hover:text-ink">
          ← {hy.common.back}
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <span className="text-[34px]">{niche.icon}</span>
          <div>
            <h1 className="text-xl font-semibold">{niche.name}</h1>
            <p className="text-[13px] text-muted">{niche.tag}</p>
          </div>
        </div>
      </header>

      <RegisterForm nicheKey={niche.key} defaultName={niche.name} />

      {/* Показываем, что бизнес получит сразу после регистрации.
          Это и есть обещание «готовая система, а не конструктор». */}
      <section className="mt-8">
        <h2 className="mb-2.5 text-[15px] font-semibold">{hy.settings.services}</h2>
        <div className="list">
          {niche.services.map((s) => (
            <div key={s.name} className="li">
              <div className="flex-1 text-[15px]">{s.name}</div>
              <div className="text-[15px] text-muted">{formatMoney(s.price)}</div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted">
          {niche.staffRole} · {niche.defaultPercent}%
        </p>
      </section>
    </main>
  );
}
