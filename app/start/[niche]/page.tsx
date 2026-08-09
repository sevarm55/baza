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

  /* Те же две половины, что у входа: слева марка, справа дело. Панель
     регистрации при этом не тронута — она же показывается окном поверх
     лендинга, и там левой половины нет. */
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14"
        style={
          {
            background:
              'radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--tone-violet-glow) 30%, transparent) 0%, transparent 62%), var(--tone-violet)',
            '--color-ink': '#ffffff',
          } as React.CSSProperties
        }
      >
        <Link href="/" aria-label={hy.app.name}>
          <Logo size={30} />
        </Link>

        <p className="max-w-[15ch] text-[clamp(30px,3.2vw,46px)] leading-[1.12] font-bold tracking-tight">
          {hy.app.tagline}
        </p>

        <span className="text-[13.5px] opacity-60">tetrin.pro</span>
      </aside>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[460px]">
          {/* На телефоне знак стоит над панелью: левой половины там нет.
              Ссылка на вход живёт внизу панели — она одна и та же на
              странице и в окне, дублировать её в шапке незачем. */}
          <header className="mb-6 lg:hidden">
            <Link href="/" aria-label={hy.app.name}>
              <Logo size={28} />
            </Link>
          </header>

          <RegisterPanel niche={niche} />
        </div>
      </div>
    </main>
  );
}
