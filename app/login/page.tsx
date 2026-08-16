import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * `/login` — адрес, а не страница.
 *
 * Форма входа живёт ровно в одном месте: окном поверх витрины. Прежде
 * их было две — окно и отдельная страница, — и они неизбежно
 * расходились: правку вносили в окно, а человек, пришедший из письма
 * или из закладки, видел вчерашний продукт.
 *
 * Адрес при этом никуда не делся: на него уводит прокси, по нему
 * приходят из закладок и из писем, и он обязан работать. Он и работает —
 * просто открывает витрину с уже открытым окном.
 */
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  redirect('/?auth=signIn');
}
