import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Armenian, Noto_Serif_Armenian } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';

/* Geist из стартового шаблона не содержит армянских глифов — весь интерфейс
   рассыпался бы на квадраты. Noto Sans Armenian покрывает и армянский, и латиницу. */
const sans = Noto_Sans_Armenian({
  variable: '--font-sans',
  subsets: ['armenian', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/* Антиква для заголовков лендинга. В приложении не используется:
   там всё решает скорость чтения, а не характер. */
const serif = Noto_Serif_Armenian({
  variable: '--font-serif',
  subsets: ['armenian', 'latin'],
  weight: ['500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Բազիս',
  description: 'Հաշվառում սպասարկման բիզնեսի համար',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Բազիս', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f1115',
  // интерфейс сотрудника живёт на телефоне: зум при тапе по полю недопустим
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hy" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
