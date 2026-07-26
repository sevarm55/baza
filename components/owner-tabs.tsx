'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hy } from '@/lib/i18n/hy';

const TABS = [
  { href: '/owner', label: hy.owner.tabToday },
  { href: '/owner/payroll', label: hy.owner.tabPayroll },
  { href: '/owner/clients', label: hy.owner.tabClients },
  { href: '/owner/passes', label: hy.passes.title, feature: 'passes' },
  { href: '/owner/staff', label: hy.settings.staff },
  { href: '/owner/settings', label: hy.owner.tabSettings },
] as const;

/** Флаг приходит с сервера: клиентский код до переменных окружения не достаёт. */
export function OwnerTabs({ passes }: { passes: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !('feature' in t) || passes);

  return (
    <nav className="scroll-x mb-4 flex gap-1.5 pb-0.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={pathname === t.href ? 'page' : undefined}
          className={`tab ${pathname === t.href ? 'tab-on' : ''}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
