import { redirect } from 'next/navigation';

/** Старый адрес: доступ и сессии живут на /admin/access. */
export default function LegacyTeamPage() {
  redirect('/admin/access');
}
