import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRememberedAccount, getSession } from '@/lib/auth';
import { startHref } from '@/lib/niches';
import { Logo } from '@/components/logo';
import { LoginForm } from './login-form';
import { getDict } from '@/lib/i18n/server';

export default async function LoginPage() {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  /* Две половины экрана вместо формы посреди пустоты.

     Форма шириной в 420 пикселей на середине монитора — это правильный
     размер поля ввода и неправильный размер страницы: вокруг остаётся
     полтора метра ничего. Слева теперь то же полотно, что во всём
     кабинете, и на нём сказано, куда человек входит.

     На телефоне левой половины нет вовсе: там экран и так шириной с
     форму, а марка стоит над ней. */
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Половина входа — большая плитка марки: тот же грейп со
          свечением из угла, что у приборов в кабинете. Тон не меняется
          со сменой темы, как и все плитки продукта: на светлой полотно
          отличалось бы от страницы на полтона, и две половины экрана
          читались бы как одна недокрашенная.

          Знак набран белым принудительно: `Logo` берёт цвет чернил
          страницы, а они здесь тёмные. */}
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
        <Logo size={30} />

        <p className="max-w-[15ch] text-[clamp(30px,3.2vw,46px)] leading-[1.12] font-bold tracking-tight">
          {t.app.tagline}
        </p>

        <span className="text-[13.5px] opacity-60">tetrin.pro</span>
      </aside>

      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px]">
          <header className="mb-6 text-center lg:text-start">
            {/* На компьютере знак уже стоит слева — второй раз он тут
                лишний, и заголовок начинает страницу сам. */}
            <Logo size={28} className="mb-4 lg:hidden" />
            <h1 className="text-2xl font-semibold">
              {remembered ? t.auth.welcomeBack : t.auth.signInTitle}
            </h1>
          </header>

          <LoginForm remembered={remembered} />

          <p className="mt-7 text-center text-sm text-muted">
            <Link href={startHref()} className="underline underline-offset-4 hover:text-ink">
              {t.onboarding.createAccount}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
