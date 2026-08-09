'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import s from './shell.module.css';

/**
 * Боковая колонка админки.
 *
 * Состояние свёрнутости хранится в localStorage, а не в адресе и не на
 * сервере: это настройка рабочего места, а не части продукта. Переключил
 * один раз — и она такая на всех страницах и после перезагрузки.
 *
 * Читается через useSyncExternalStore, а не эффектом с setState. Эффект
 * работал бы тоже, но он рисует кадр развёрнутым и схлопывает следующим —
 * колонка моргает при каждом переходе между страницами админки.
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

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  count?: number;
  /** ещё один адрес, при котором пункт считается открытым: карточка
      клиента живёт не под /admin/…, а сбоку, и без этого в ней не
      подсвечен ни один пункт — кажется, что ушёл из админки */
  also?: string;
};

export function Sidebar({ items, who }: { items: NavItem[]; who: string }) {
  const path = usePathname();
  // на сервере колонка всегда развёрнута: localStorage там нет
  const collapsed = useSyncExternalStore(store.subscribe, store.get, () => false);

  return (
    <aside className={s.side} data-collapsed={collapsed}>
      <div className={s.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className={s.brandMark} aria-hidden />
        <span className={s.brandText}>Tetrin</span>
      </div>

      <nav className={s.nav}>
        {items.map((it) => {
          const on =
            (it.href === '/admin' ? path === '/admin' : path.startsWith(it.href)) ||
            (it.also ? path.startsWith(it.also) : false);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`${s.link} ${on ? s.linkOn : ''}`}
              title={it.label}
            >
              <span className={s.icon} aria-hidden>
                {it.icon}
              </span>
              <span className={s.label}>{it.label}</span>
              {it.count !== undefined && it.count > 0 && (
                <span className={s.count}>{it.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={s.sideFoot}>
        <div className={s.who}>{who}</div>
        <button
          className={s.toggle}
          onClick={() => store.set(!collapsed)}
          aria-label="Свернуть меню"
        >
          <span className={s.icon} aria-hidden>
            {collapsed ? '»' : '«'}
          </span>
          <span className={s.label}>Свернуть</span>
        </button>
      </div>
    </aside>
  );
}
