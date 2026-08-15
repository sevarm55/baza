import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, dict } from '@/lib/i18n';

/**
 * Манифест установленного приложения.
 *
 * Единственное место продукта, которое НЕ идёт за куку языка, и это
 * намеренно: манифест читает система при установке, один раз, а имя и
 * описание после этого лежат в списке приложений телефона до
 * переустановки. Язык интерфейса человек меняет внутри, и переписывать
 * из-за этого ярлык на домашнем экране нельзя — он уже не наш.
 *
 * Имя всё равно одно на всех языках: Tetrin — марка, а не слово.
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = dict(DEFAULT_LOCALE);
  return {
    name: t.app.name,
    short_name: t.app.name,
    description: t.app.tagline,
    lang: DEFAULT_LOCALE,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // фон заставки совпадает с фоном иконки — иначе при запуске
    // светлая плитка вспыхивает на тёмном поле
    background_color: '#2E1065',
    theme_color: '#120f1a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
