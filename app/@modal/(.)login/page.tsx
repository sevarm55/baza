import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hy } from '@/lib/i18n/hy';
import { startHref } from '@/lib/niches';
import { Modal } from '@/components/modal';
import { Logo } from '@/components/logo';
import { LoginForm } from '@/app/login/login-form';

/**
 * Вход, перехваченный поверх страницы.
 *
 * Тот же адрес `/login` и та же форма, что и на отдельной странице:
 * переход по ссылке внутри сайта показывает окно, прямой заход или
 * перезагрузка — полноценную страницу. Прокси уводит неавторизованных
 * именно на `/login`, и это должно работать без оговорок.
 */
export default async function LoginModal() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  return (
    <Modal path="/login">
      <div className="mb-5">
        <Logo size={30} className="mb-4" />
        <h1 className="text-[22px] font-bold">{hy.auth.signInTitle}</h1>
      </div>
      <LoginForm />

      {/* Окно не должно быть тупиком: у пришедшего впервые аккаунта ещё нет */}
      <p className="mt-6 text-center text-[13px] text-muted">
        <Link href={startHref()} className="underline underline-offset-4 hover:text-ink">
          {hy.onboarding.createAccount}
        </Link>
      </p>
    </Modal>
  );
}
