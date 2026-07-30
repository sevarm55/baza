'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { hy } from '@/lib/i18n/hy';
import { usePendingTab } from '@/components/use-pending-tab';

const TABS = [
  { href: '/owner', label: hy.owner.tabToday },
  { href: '/owner/payroll', label: hy.owner.tabPayroll },
  { href: '/owner/expenses', label: hy.expenses.title },
  { href: '/owner/clients', label: hy.owner.tabClients },
  { href: '/owner/passes', label: hy.passes.title, feature: 'passes' },
  { href: '/owner/staff', label: hy.settings.staff },
  { href: '/owner/settings', label: hy.owner.tabSettings },
] as const;

/** Флаг приходит с сервера: клиентский код до переменных окружения не достаёт. */
export function OwnerTabs({ passes }: { passes: boolean }) {
  const pathname = usePathname();
  const { active, pending, select } = usePendingTab(pathname);
  const strip = useRef<HTMLElement>(null);
  const tabs = TABS.filter((t) => !('feature' in t) || passes);

  /* На телефоне вкладки шире экрана. Выбранная запросто оказывается
     за краем — и кажется, что не выбрано ничего. Довозим её в видимое,
     двигая только саму полосу: страницу трогать нельзя, иначе прыгнет
     то, что человек читает. */
  useEffect(() => {
    const box = strip.current;
    const tab = box?.querySelector('[aria-current="page"]');
    if (!box || !tab) return;

    const air = 12;
    const outer = box.getBoundingClientRect();
    const inner = tab.getBoundingClientRect();

    if (inner.left < outer.left + air) {
      box.scrollLeft -= outer.left + air - inner.left;
    } else if (inner.right > outer.right - air) {
      box.scrollLeft += inner.right - (outer.right - air);
    }
  }, [active]);

  return (
    <nav ref={strip} className="scroll-x mb-4 flex gap-1.5 pb-0.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={() => select(t.href)}
          aria-current={active === t.href ? 'page' : undefined}
          data-pending={pending && active === t.href ? '' : undefined}
          className={`tab ${active === t.href ? 'tab-on' : ''}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
