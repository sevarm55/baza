import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns/states';
import { getAdminDict } from '@/lib/i18n/admin/server';

/** Есть сессия, нет роли: честно сказать, а не прикидываться 404. */
export default async function ForbiddenPage() {
  const a = await getAdminDict();
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <EmptyState
        className="max-w-md"
        title={a.login.forbiddenTitle}
        description={a.login.forbiddenLead}
        action={<Button variant="outline" render={<Link href="/admin" />}>{a.nav.dashboard}</Button>}
      />
    </div>
  );
}
