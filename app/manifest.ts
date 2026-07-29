import type { MetadataRoute } from 'next';
import { hy } from '@/lib/i18n/hy';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: hy.app.name,
    short_name: hy.app.name,
    description: hy.app.tagline,
    lang: 'hy',
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
