'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Появление содержимого при переходе между разделами. Оболочка остаётся
 * на месте, меняется только рабочая область, и она не подставляется
 * встык. Ключом стоит адрес: без него React считает содержимое тем же
 * узлом, и анимация не проигрывается.
 */
export function PageFade({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="page-enter min-w-0">
      {children}
    </div>
  );
}
