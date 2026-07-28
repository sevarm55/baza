import { notFound, redirect } from 'next/navigation';
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
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const { niche: key } = await params;
  const niche = NICHES[key as NicheKey];
  if (!niche || !niche.enabled) notFound();

  return (
    <Modal path={`/start/${niche.key}`}>
      <RegisterPanel niche={niche} />
    </Modal>
  );
}
