import { redirect } from 'next/navigation';

/** Старый адрес журнала. */
export default function LegacyJournalPage() {
  redirect('/admin/activity');
}
