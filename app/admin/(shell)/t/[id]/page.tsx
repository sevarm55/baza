import { redirect } from 'next/navigation';

/** Старый адрес карточки клиента. */
export default async function LegacyTenantPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/businesses/${(await params).id}`);
}
