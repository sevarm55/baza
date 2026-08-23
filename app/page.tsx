import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getRememberedAccount, getSession } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES, getNiche } from '@/lib/niches';
import { AuthPortal, AuthTrigger } from '@/components/auth-buttons';
import { LanguagePicker } from '@/components/language-picker';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { buttonVariants } from '@/components/ui/button';
import { getDict } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import {
  AppSection,
  Closing,
  Faq,
  Flow,
  Footer,
  Hero,
  Pricing,
  Problem,
  Product,
  SHELL,
} from '@/components/landing/sections';

/**
 * Витрина.
 *
 * Собрана из тех же токенов и компонентов, что и кабинет: полоса
 * показаний, панели, лента событий, графики отчёта. Человек, который
 * зарегистрируется, обязан узнать экран, который ему показали.
 *
 * Порядок разделов повторяет разговор с владельцем: обещание, что
 * ломается без системы, как одна запись проходит путь, что внутри по
 * разделам кабинета, приложение, цена, вопросы, приглашение.
 *
 * Вход и регистрация живут ТОЛЬКО в окне (`components/auth-buttons.tsx`),
 * язык и тема выбираются в шапке до входа, `/?auth=signIn` открывает
 * окно прямо с адреса, а вошедшего страница не показывает: он уходит
 * в свой кабинет.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.meta.landingTitle, description: t.meta.landingDescription };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  const { auth } = await searchParams;
  const opened = auth === 'signIn' || auth === 'register' ? auth : null;
  const niche = ACTIVE_NICHES[0] ?? getNiche('carwash');
  const l = t.landing;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <AuthPortal initial={opened} niche={niche.key} remembered={remembered} trialDays={TRIAL_DAYS} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {l.nav.skip}
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <nav aria-label={l.nav.navAria} className={cn(SHELL, 'flex h-14 items-center gap-6')}>
          <Link href="/" aria-label={l.nav.homeAria} className="flex items-center">
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">
              {l.nav.how}
            </a>
            <a href="#features" className="hover:text-foreground">
              {l.nav.features}
            </a>
            <a href="#price" className="hover:text-foreground">
              {l.nav.price}
            </a>
            <a href="#faq" className="hover:text-foreground">
              {l.nav.faq}
            </a>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguagePicker compact />
            <ThemeToggle />
            <AuthTrigger mode="signIn" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
              {t.auth.signInTitle}
            </AuthTrigger>
            <AuthTrigger mode="register" className={buttonVariants({ size: 'sm' })}>
              {l.nav.start}
            </AuthTrigger>
          </div>
        </nav>
      </header>

      <main id="main">
        <Hero t={t} />
        <Problem t={t} />
        <Flow t={t} />
        <Product t={t} />
        <AppSection t={t} />
        <Pricing t={t} />
        <Faq t={t} />
        <Closing t={t} />
      </main>

      <Footer t={t} />
    </div>
  );
}
