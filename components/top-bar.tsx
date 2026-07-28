import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
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
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5">
          <Logo size={26} withName={false} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{tenantName}</div>
            <div className="truncate text-[11.5px] text-muted">{subtitle}</div>
          </div>
        </div>

        <div className="order-2 flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <SignOutButton />
        </div>

        {/* Владелец переключается между своим кабинетом и экраном записи:
            на маленькой мойке он и сам моет. */}
        {role === 'owner' && (
          /* Выбранная сторона — белая плашка на сером жёлобе, а не
             мандариновая заливка: это «вы находитесь здесь», а мандарин
             в продукте означает «нажми меня». */
          <nav className="order-3 flex w-full gap-1 rounded-[14px] bg-surface2 p-1 sm:order-2 sm:w-auto">
            {(
              [
                { href: '/work', key: 'work', label: hy.roles.staff },
                { href: '/owner', key: 'owner', label: hy.roles.owner },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active === tab.key ? 'page' : undefined}
                className={`flex-1 rounded-[10px] px-3.5 py-2 text-center text-[13.5px] transition sm:flex-none ${
                  active === tab.key
                    ? 'bg-surface font-semibold text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
