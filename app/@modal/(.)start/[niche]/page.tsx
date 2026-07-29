import { notFound } from 'next/navigation';
import { NICHES, type NicheKey } from '@/lib/niches';
import { getSession } from '@/lib/auth';
import { Modal } from '@/components/modal';
import { RegisterPanel } from '@/app/start/[niche]/register-panel';

/** Регистрация окном поверх лендинга. Содержимое то же, что на странице. */
export default async function RegisterModal({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const session = await getSession();
  // Тот же случай, что и во входе: зарегистрировавшийся уходит отсюда
  // редиректом, а слот остаётся занят регистрацией. Уводить из него нельзя —
  // иначе каждый следующий переход возвращал бы на /owner. См. (.)login.
  if (session) return null;

  const { niche: key } = await params;
  const niche = NICHES[key as NicheKey];
  if (!niche || !niche.enabled) notFound();

  return (
    <Modal path={`/start/${niche.key}`}>
      <RegisterPanel niche={niche} />
    </Modal>
  );
}
