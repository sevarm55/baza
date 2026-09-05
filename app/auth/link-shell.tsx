import type { ReactNode } from 'react';
import Link from 'next/link';

import { Grain } from '@/components/landing/grain';
import { BRAND } from '@/lib/brand';

/**
 * Лист под страницы, куда ведут ссылки из письма.
 *
 * Тот же грунт и то же зерно, что у витрины: человек пришёл сюда из
 * письма, а не из кабинета, и попасть должен на ту же страницу, с
 * которой уходил. Шапки и меню здесь нет намеренно — на этой странице
 * ровно одно действие, и уводить с неё некуда.
 */
export function LinkShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-svh flex-col bg-[var(--landing-bg)]">
      <Grain />

      <header className="relative z-10 px-5 py-6 md:px-10 md:py-8">
        <Link
          href="/"
          className="font-wordmark text-[18px] tracking-[0.02em] text-[#1a120e] uppercase outline-none dark:text-white"
        >
          {BRAND}
        </Link>
      </header>

      <div className="relative z-10 flex flex-1 items-start justify-center px-5 pb-16 md:items-center md:px-10 md:pb-24">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}
