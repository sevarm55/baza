import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { THEME_SCRIPT } from '@/lib/theme-script';
import { ServiceWorker } from '@/components/service-worker';
import { StagingBadge } from '@/components/staging-badge';
import { isStaging, stagingLabel } from '@/lib/staging';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { getDict, getLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';

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

/**
 * Марка — и только марка.
 *
 * Unbounded Black: широкий геометрический гротеск, из которого слово
 * «TETRIN» в разрядку читается знаком, а не подписью. Отдельным
 * начертанием, а не общим шрифтом продукта, потому что армянских глифов
 * в нём нет вовсе (см. ad-creative: он всегда работает в паре с
 * Mardoto), а интерфейс у нас армянский. Отсюда правило: этой
 * переменной набирается ровно одно слово на весь продукт — само имя.
 *
 * Латиница и всё: имя марки не переводится ни на одном языке, кириллица
 * и армянский ему не нужны, а лишний файл — это лишние килобайты на
 * первой загрузке экрана мойщика.
 */
const wordmark = localFont({
  src: './fonts/Unbounded-Latin-Black.woff2',
  variable: '--font-wordmark',
  display: 'swap',
});

/**
 * Заголовок вкладки и описание — на языке страницы.
 *
 * Название продукта не переводится ни на одном языке: Tetrin — марка.
 * Переводится строка под ним, потому что её читает и человек в поиске,
 * и предпросмотр ссылки в мессенджере.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return {
    /* На стенде имя вкладки начинается с метки.
       Рамка вокруг окна видна, только когда на неё смотрят, а вкладок у
       человека открыто несколько, и боевая с тестовой различаются в
       списке лишь заголовком. */
    title: isStaging() ? `${stagingLabel()} · ${t.app.name}` : t.app.name,
    description: t.app.tagline,
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: t.app.name, statusBarStyle: 'black-translucent' },
    icons: {
      icon: [
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: '/apple-icon.png',
    },
  };
}

export const viewport: Viewport = {
  /* Цвет строки состояния и полосы браузера на телефоне.
   *
   * Белый, а не полотно кабинета: ниже 768px продукт живёт на белом
   * листе, и серая полоса сверху выглядела чужой рамкой вокруг экрана.
   * Системную схему здесь не спрашиваем — тему в продукте выбирают
   * руками, поэтому под выбранную его подменяет тот же скрипт, что
   * ставит `data-theme` (см. `lib/theme-script.ts`). */
  themeColor: '#ffffff',
  // интерфейс сотрудника живёт на телефоне: зум при тапе по полю недопустим
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  /* Страница во весь экран, до самых краёв.
   *
   * Без этого `env(safe-area-inset-*)` на iPhone равен нулю — всегда, у
   * всех, — и любое поле, рассчитанное по безопасной зоне, не
   * существует. А рассчитывать по ней приходится: строка состояния
   * объявлена прозрачной (`black-translucent` выше), то есть в
   * установленном приложении веб-вид и так лежит под чёлкой, и без
   * отступа шапка кабинета оказывалась ровно под часами.
   *
   * Второй край — нижний. Полоса разделов прижата к низу экрана, а под
   * ней домашняя черта; без безопасной зоны вкладка «Ещё» попадала бы
   * под неё, и нажать её можно было бы только со второго раза.
   *
   * Боковые края закрыты явно там, где содержимое доходит до них:
   * полотно кабинета, шапка, полоса разделов и поле витрины считают
   * своё поле через `max(...)`. В повороте на телефоне с чёлкой это те
   * самые сорок семь точек, за которыми текста быть не должно. */
  viewportFit: 'cover',
  /**
   * Клавиатура сжимает страницу, а не накрывает её.
   *
   * По умолчанию браузер уменьшает только видимую область: раскладка
   * остаётся прежней высоты, и всё, что прибито к низу, уезжает под
   * клавиатуру. На экране записи машины это кнопка «Добавить» и ряд
   * способов оплаты — то есть последнее движение, ради которого экран и
   * открыли: мойщик набирает номер, а подтвердить запись ему нечем,
   * пока он не закроет клавиатуру руками.
   *
   * `resizes-content` уменьшает саму раскладку, и `100dvh` листа
   * становится тем, что реально видно. Поля при этом остаются в
   * прокрутке и доезжают до фокуса сами.
   */
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  /* Язык читается здесь и больше нигде: разметка получает `lang`, а
     клиентские компоненты — код языка через провайдер. Ниже по дереву
     никто не спрашивает «какой сейчас язык» — все спрашивают слова. */
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${sans.variable} ${wordmark.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Тема ставится до первой отрисовки, иначе экран моргнёт чужим
            цветом — на телефоне это очень заметно.

            Системную тему больше не спрашиваем: светлая — это и есть вид
            продукта, и он должен быть одинаковым у всех, кому его
            показывают. Тёмная включается только вручную и запоминается. */}
        {/* Ключа здесь нет намеренно: React не восстанавливает атрибут
            `nonce` при гидратации, деревья расходятся, и страница
            остаётся картинкой без единой работающей кнопки. Скрипт
            разрешён хешем — см. lib/theme-script.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>
          <TooltipProvider>
            {children}
            {modal}
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
        <StagingBadge />
        <ServiceWorker />
      </body>
    </html>
  );
}
