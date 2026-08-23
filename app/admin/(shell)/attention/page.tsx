import { redirect } from 'next/navigation';

/** Старый адрес: список «внимание» живёт фильтром списка бизнесов. */
export default function LegacyAttentionPage() {
  redirect('/admin/businesses?state=attention');
}
