import { notFound, redirect } from 'next/navigation';
import { NICHES, type NicheKey } from '@/lib/niches';
import { getSession } from '@/lib/auth';

/**
 * `/start/:niche` — адрес, а не страница.
 *
 * Как и `/login`: регистрация живёт окном поверх витрины, и второй
 * поверхности для неё нет. Ниша проверяется здесь же — на закрытую
 * нишу по прямой ссылке не пускают, и это не должно зависеть от того,
 * что нарисовано в окне.
 */
export default async function StartPage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const { niche: key } = await params;
  const niche = NICHES[key as NicheKey];
  if (!niche || !niche.enabled) notFound();

  redirect('/?auth=register');
}
