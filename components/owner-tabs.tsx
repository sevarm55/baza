'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hy } from '@/lib/i18n/hy';

const TABS = [
  { href: '/owner', label: hy.owner.tabToday },
  { href: '/owner/payroll', label: hy.owner.tabPayroll },
  { href: '/owner/clients', label: hy.owner.tabClients },
  { href: '/owner/passes', label: hy.passes.title },
  { href: '/owner/staff', label: hy.settings.staff },
  { href: '/owner/settings', label: hy.owner.tabSettings },
];

export function OwnerTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1.5 overflow-x-auto">
      {TABS.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-full border px-[15px] py-[9px] text-[13.5px] ${
              on
                ? 'border-ink bg-ink font-semibold text-bg'
                : 'border-line bg-surface text-muted'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
