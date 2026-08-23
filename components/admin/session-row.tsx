'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { revokeAdminSessionAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { useA } from '@/lib/i18n/admin/client';

/** Открытая сессия админки: устройство, адрес, последний запрос, «Завершить». */
export function SessionRow({
  session,
}: {
  session: { id: string; label: string; ip: string | null; lastSeen: string; current: boolean };
}) {
  const a = useA();
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {session.label}
          {session.current && <span className="ml-1.5 text-xs text-muted-foreground">· {a.common.current}</span>}
        </span>
        <span className="num block truncate text-xs text-muted-foreground">
          {session.ip ?? '—'} · {session.lastSeen}
        </span>
      </span>
      {!session.current && (
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await revokeAdminSessionAction({ sessionId: session.id });
              if (res.ok) toast.success(a.access.revoked);
              else toast.error(a.common.error);
            })
          }
        >
          {a.access.revoke}
        </Button>
      )}
    </li>
  );
}
