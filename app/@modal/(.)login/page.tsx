import Link from 'next/link';
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
  /* Вошедшего уводит отсюда страница /login в основном слоте — здесь
     редиректа быть не должно.

     Слот @modal не забывает содержимое: войдя через это окно, человек
     уходит на /owner редиректом, а слот так и остаётся занят входом и
     перерисовывается на КАЖДОМ следующем переходе. Редирект отсюда
     возвращал бы на /owner при любом клике по вкладке — и так до полной
     перезагрузки страницы. Пустой слот безвреден: окно всё равно снимает
     себя, как только адрес перестал быть его. */
  if (session) return null;

  return (
    <Modal path="/login">
      <div className="mb-5">
        <Logo size={30} className="mb-4" />
        <h1 className="text-[22px] font-bold">{hy.auth.signInTitle}</h1>
      </div>
      <LoginForm />

      {/* Окно не должно быть тупиком: у пришедшего впервые аккаунта ещё нет */}
      <p className="mt-6 text-center text-[13.5px] text-muted">
        <Link href={startHref()} className="underline underline-offset-4 hover:text-ink">
          {hy.onboarding.createAccount}
        </Link>
      </p>
    </Modal>
  );
}
