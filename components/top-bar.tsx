import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { SignOutButton } from '@/components/sign-out-button';
import type { Role } from '@/lib/auth';

export function TopBar({
  tenantName,
  subtitle,
  role,
  active,
}: {
  tenantName: string;
  subtitle: string;
  role: Role;
  active?: 'work' | 'owner';
}) {
  return (
    <header className="sticky top-0 z-20 mb-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[760px] items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{tenantName}</div>
          <div className="truncate text-[11.5px] text-muted">{subtitle}</div>
        </div>

        {/* Владелец переключается между своим кабинетом и экраном записи:
            на маленькой мойке он и сам моет. */}
        {role === 'owner' && (
          <nav className="flex gap-0.5 rounded-[10px] bg-surface2 p-[3px]">
            <Link
              href="/work"
              className={`rounded-lg px-3 py-1.5 text-[13px] ${
                active === 'work' ? 'bg-accent font-semibold text-white' : 'text-muted'
              }`}
            >
              {hy.roles.staff}
            </Link>
            <Link
              href="/owner"
              className={`rounded-lg px-3 py-1.5 text-[13px] ${
                active === 'owner' ? 'bg-accent font-semibold text-white' : 'text-muted'
              }`}
            >
              {hy.roles.owner}
            </Link>
          </nav>
        )}

        <SignOutButton />
      </div>
    </header>
  );
}
