'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { addAdminAction, deactivateAdminAction, revokeAdminSessionAction, setAdminRoleAction } from '@/app/admin/actions';
import { ReasonDialog } from '@/components/admin/reason-dialog';
import { PersonAvatar } from '@/components/patterns/person';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { PhoneField } from '@/components/phone-field';
import { useA } from '@/lib/i18n/admin/client';
import { useT } from '@/lib/i18n/client';
import { formatPhone, normalizePhone } from '@/lib/phone';
import type { AdminRole } from '@/lib/admin-auth';

const ROLES: AdminRole[] = ['viewer', 'support', 'owner'];

export function AdminRow({
  admin,
  self,
  canManage,
}: {
  admin: { id: string; name: string; phone: string; role: string; active: boolean; lastLoginAt: string | null };
  self: boolean;
  canManage: boolean;
}) {
  const a = useA();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  const changeRole = (role: string) => {
    start(async () => {
      const res = await setAdminRoleAction({ adminId: admin.id, role });
      if (res.ok) toast.success(a.team.roleChanged);
      else toast.error(res.error === 'self' ? a.team.cannotSelf : a.common.error);
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
      <PersonAvatar name={admin.name} size="md" className={admin.active ? '' : 'opacity-50'} />
      <span className="min-w-40 flex-1">
        <span className={`block truncate font-medium ${admin.active ? '' : 'text-muted-foreground line-through'}`}>
          {admin.name}
          {self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {a.common.current}</span>}
        </span>
        <span className="num block text-xs text-muted-foreground">
          {formatPhone(admin.phone)} · {a.team.lastLogin}: {admin.lastLoginAt ?? a.common.never}
        </span>
      </span>
      {canManage && !self && admin.active ? (
        <NativeSelect size="sm" aria-label={a.team.role} value={admin.role} onChange={(e) => changeRole(e.target.value)} disabled={pending}>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {a.roles[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <StatusBadge tone={admin.active ? 'brand' : 'neutral'}>{a.roles[admin.role as AdminRole] ?? admin.role}</StatusBadge>
      )}
      {canManage && !self && admin.active && (
        <Button size="sm" variant="destructive-soft" onClick={() => setAsking(true)} disabled={pending}>
          {a.team.deactivate}
        </Button>
      )}
      {asking && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          title={a.team.deactivateTitle(admin.name)}
          description={a.team.deactivateNote}
          confirmLabel={a.team.deactivate}
          action={(reason) => deactivateAdminAction({ adminId: admin.id, reason })}
          successMessage={a.team.deactivated}
        />
      )}
    </li>
  );
}

export function AddAdminForm() {
  const a = useA();
  const t = useT();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState({ nsn: '', country: 'AM' });
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await addAdminAction({ phone: normalizePhone(phone.nsn, phone.country), name, role });
          if (res.ok) {
            toast.success(a.team.added);
            setName('');
          } else {
            setError(res.error === 'notFound' ? a.team.notFound : res.error === 'exists' ? a.team.exists : a.common.error);
          }
        });
      }}
    >
      <PhoneField label={a.login.phone} countryLabel={t.auth.country} onChange={(nsn, country) => setPhone({ nsn, country })} invalid={!!error} />
      <Field>
        <FieldLabel htmlFor="admin-name">{a.team.addName}</FieldLabel>
        <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </Field>
      <Field>
        <FieldLabel htmlFor="admin-role">{a.team.role}</FieldLabel>
        <NativeSelect id="admin-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {a.roles[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || phone.nsn.length < 6 || name.trim().length < 2}>
        {pending && <Spinner data-icon="inline-start" />}
        {a.team.add}
      </Button>
    </form>
  );
}

export function SessionRow({ session }: { session: { id: string; label: string; ip: string | null; lastSeen: string; current: boolean } }) {
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
              if (res.ok) toast.success(a.team.revoked);
              else toast.error(a.common.error);
            })
          }
        >
          {a.team.revoke}
        </Button>
      )}
    </li>
  );
}
