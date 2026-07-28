import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { NICHES, type NicheKey } from '@/lib/niches';
import { getSession } from '@/lib/auth';
import { hy } from '@/lib/i18n/hy';
import { Logo } from '@/components/logo';
import { RegisterPanel } from './register-panel';

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const { niche: key } = await params;
  const niche = NICHES[key as NicheKey];
  // закрытую нишу нельзя открыть и прямой ссылкой
  if (!niche || !niche.enabled) notFound();

  return (
    <main className="mx-auto w-full max-w-[460px] px-4 pb-24">
      {/* Ссылка на вход живёт внизу панели — она одна и та же на странице
          и в окне, дублировать её в шапке незачем. */}
      <header className="py-6">
        <Link href="/" aria-label={hy.app.name}>
          <Logo size={28} />
        </Link>
      </header>

      <RegisterPanel niche={niche} />
    </main>
  );
}
