import type { Metadata } from 'next';

/**
 * Корень админки: только заголовок вкладки. Права проверяет каркас в
 * `(shell)/layout.tsx`; страница входа лежит рядом и прав не требует.
 */
export const metadata: Metadata = { title: 'Tetrin · Admin', robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return children;
}
