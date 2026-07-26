import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
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
      {/* На телефоне переключатель ролей уходит на вторую строку.
          Иначе три элемента в ряд сжимают название бизнеса до одной
          буквы — а владелец должен видеть, куда он вошёл. */}
      <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-x-3 gap-y-2">
        <div className="order-1 min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{tenantName}</div>
          <div className="truncate text-[11.5px] text-muted">{subtitle}</div>
        </div>

        <div className="order-2 flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <SignOutButton />
        </div>

        {/* Владелец переключается между своим кабинетом и экраном записи:
            на маленькой мойке он и сам моет. */}
        {role === 'owner' && (
          <nav className="order-3 flex w-full gap-0.5 rounded-[10px] bg-surface2 p-[3px] sm:order-2 sm:w-auto">
            <Link
              href="/work"
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-[13px] sm:flex-none ${
                active === 'work' ? 'bg-accent font-semibold text-white' : 'text-muted'
              }`}
            >
              {hy.roles.staff}
            </Link>
            <Link
              href="/owner"
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-[13px] sm:flex-none ${
                active === 'owner' ? 'bg-accent font-semibold text-white' : 'text-muted'
              }`}
            >
              {hy.roles.owner}
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
