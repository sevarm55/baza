import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * Пустая заглавная.
 *
 * Лендинга нет: ни текста, ни стилей, ни снимков — только слово по
 * центру белого экрана.
 *
 * Переход по сессии оставлен. Он не часть витрины: это маршрутизация,
 * по которой вошедший человек попадает туда, где работает. Убери её —
 * и владелец, открывший закладку, увидит вместо кабинета пустую
 * страницу.
 */
export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#ffffff',
        color: '#000000',
      }}
    >
      welcome tetrin
    </main>
  );
}
