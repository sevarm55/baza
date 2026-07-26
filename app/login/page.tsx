import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hy } from '@/lib/i18n/hy';
import { Logo } from '@/components/logo';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  return (
    <main className="mx-auto w-full max-w-[420px] px-4 pb-24">
      <header className="pt-16 pb-6 text-center">
        <Logo size={28} className="mb-4" />
        <h1 className="text-2xl font-semibold">{hy.auth.signInTitle}</h1>
      </header>

      <LoginForm />

      <p className="mt-7 text-center text-sm text-muted">
        <Link href="/start" className="underline underline-offset-4 hover:text-ink">
          {hy.onboarding.createAccount}
        </Link>
      </p>
    </main>
  );
}
