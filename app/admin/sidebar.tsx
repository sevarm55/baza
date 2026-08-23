'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import {
  Banknote,
  CircleAlert,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/utils';

/**
 * Боковая колонка админки.
 *
 * Состояние свёрнутости хранится в localStorage, а не в адресе и не на
 * сервере: это настройка рабочего места. Читается через
 * useSyncExternalStore, а не эффектом с setState: эффект рисовал бы
 * кадр развёрнутым и схлопывал следующим, и колонка моргала бы при
 * каждом переходе.
 */
const KEY = 'tetrin.admin.sidebar';

const store = {
  subscribe(fn: () => void) {
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  },
  get() {
    return localStorage.getItem(KEY) === '1';
  },
  set(value: boolean) {
    localStorage.setItem(KEY, value ? '1' : '0');
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
  },
};

export type NavIcon = 'tenants' | 'payments' | 'attention' | 'journal';

const ICONS: Record<NavIcon, typeof Users> = {
  tenants: Users,
  payments: Banknote,
  attention: CircleAlert,
  journal: ScrollText,
};

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  count?: number;
  /** ещё один адрес, при котором пункт считается открытым: карточка
      клиента живёт сбоку от /admin, и без этого в ней не подсвечен ни
      один пункт */
  also?: string;
};

export function Sidebar({ items, who }: { items: NavItem[]; who: string }) {
  const path = usePathname();
  // на сервере колонка всегда развёрнута: localStorage там нет
  const collapsed = useSyncExternalStore(store.subscribe, store.get, () => false);

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="size-6 shrink-0 rounded-md" aria-hidden />
        {!collapsed && <Wordmark />}
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Разделы админки">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const on =
            (it.href === '/admin' ? path === '/admin' : path.startsWith(it.href)) ||
            (it.also ? path.startsWith(it.also) : false);
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.label}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                on
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className={cn('size-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
              {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
              {!collapsed && it.count !== undefined && it.count > 0 && (
                <Badge variant="muted" className="num">
                  {it.count}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 py-2">
        {!collapsed && (
          <div className="truncate px-2 py-1 text-xs text-muted-foreground">{who}</div>
        )}
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? 'icon-sm' : 'sm'}
          className={cn('text-muted-foreground', collapsed ? 'self-center' : 'justify-start')}
          onClick={() => store.set(!collapsed)}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden />
          ) : (
            <>
              <PanelLeftClose data-icon="inline-start" aria-hidden />
              Свернуть
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
