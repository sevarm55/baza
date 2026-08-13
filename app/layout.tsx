import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Mardoto — весь текст продукта.
 *
 * Армянский гротеск, нарисованный под этот алфавит, а не растянутый из
 * латиницы. В Google Fonts его нет, поэтому файлы лежат в проекте:
 * свой хостинг вместо чужого CDN — чужая доступность и чужая аналитика
 * на своём сайте никому не нужны. Лицензия Apache 2.0, текст рядом.
 *
 * Начертаний у Mardoto шесть, берём три: этого хватает интерфейсу,
 * а каждое лишнее — ещё 28 КБ на первой загрузке.
 *
 * Диапазоны в weight не случайны: полужирного (600) у Mardoto нет, и без
 * них браузер по правилам подбора взял бы для 600 ближайший сверху — Bold.
 * Тогда каждая подпись и каждая цифра в интерфейсе стали бы жирными.
 */
const sans = localFont({
  src: [
    { path: './fonts/Mardoto-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Mardoto-Medium.woff2', weight: '500 600', style: 'normal' },
    { path: './fonts/Mardoto-Bold.woff2', weight: '700 900', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tetrin',
  description: 'Հաշվառում սպասարկման բիզնեսի համար',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Tetrin', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  // цвет строки состояния на телефоне должен совпадать с фоном страницы,
  // иначе сверху висит полоса чужого цвета
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#14120f' },
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
  ],
  // интерфейс сотрудника живёт на телефоне: зум при тапе по полю недопустим
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html
      lang="hy"
      className={`${sans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Тема ставится до первой отрисовки, иначе экран моргнёт чужим
            цветом — на телефоне это очень заметно.

            Системную тему больше не спрашиваем: светлая — это и есть вид
            продукта, и он должен быть одинаковым у всех, кому его
            показывают. Тёмная включается только вручную и запоминается. */}
        <script
          dangerouslySetInnerHTML={{
            // тёмная по умолчанию: продукт выглядит так же, как приложение
            __html: `(()=>{try{document.documentElement.dataset.theme=localStorage.getItem('bazis.theme')==='light'?'light':'dark'}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {children}
          {modal}
        </TooltipProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
