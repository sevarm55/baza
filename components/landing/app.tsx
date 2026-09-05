import Image from 'next/image';

import type { Dict } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { BRAND } from '@/lib/brand';
import { APP_STORE_URL, TRIAL_DAYS } from '@/lib/plan';

import { AppStage } from './app-stage';
import { LIVE } from './live-demo';
import { Phone } from './phone';
import { Words } from './words';

/**
 * Приложение в App Store. Секция перед ценой.
 *
 * Стоит именно перед ней: в перечне того, что входит в цену, приложение
 * упомянуто строкой, и человек должен уже знать, о чём речь, когда до
 * этой строки дойдёт.
 *
 * Секция собрана вокруг предмета, а не вокруг текста: телефон с
 * НАСТОЯЩИМ экраном текущей сборки (`phone.tsx`), тёплый свет за ним и
 * две плашки рядом. Числа в экране те же, что в кабинете двумя секциями
 * выше: мойка одна и та же.
 *
 * Кадр собирается прокруткой (`app-stage.tsx`): поднимается, расходится
 * во всю ширину окна, телефон прилетает из наклона, плашки выскакивают,
 * текст выезжает сбоку — и всё это идёт ровно настолько, насколько
 * человек прокрутил. Сама секция ничего об этом не знает: она отдаёт
 * раскладке три куска и не заботится, как они появляются.
 *
 * Плашки не выдуманы: «записано» и сумма — те же слова и та же машина,
 * что собираются во второй секции; вторая повторяет обещание первого
 * экрана. Ни одной строки, которой нет в продукте.
 *
 * Знак магазина официальный и подменять его своей кнопкой нельзя:
 * правила Apple требуют либо его, либо ничего. Google Play рядом не
 * стоит намеренно — релиза в Android нет, и знак означал бы, что он
 * есть.
 */

/**
 * Стекло плашки. Один рецепт на обе.
 *
 * Заливка почти непрозрачная, а не шесть процентов, как в приёме, откуда
 * взят сам ход. Там за стеклом всё тёмное, и полупрозрачная плашка
 * читается всегда. У нас она наполовину лежит на белом снимке экрана, и
 * прозрачное стекло на нём попросту исчезало.
 *
 * `z-10` обязателен: у телефона трёхмерное преобразование, и без явного
 * слоя он перекрывает соседей по разметке, хотя стоит раньше них.
 */
const GLASS = [
  'z-10 inline-flex items-center gap-3 rounded-2xl px-4 py-3',
  'border border-border bg-[var(--landing-bg)]/92 backdrop-blur-xl',
  'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]',
].join(' ');

export function AppStore({ t }: { t: Dict }) {
  const l = t.landing.app;

  /* Первый акт: подпись слева. */
  const lead = (
    <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground md:text-base">
      {l.lead}
    </p>
  );

  /* Первый акт: имя марки справа. Тем же начертанием, что заголовок
     первого экрана, — на витрине это слово набирается только им. */
  const brand = (
    <span className="font-wordmark text-[54px] leading-none tracking-[-0.02em] uppercase select-none md:text-[84px] lg:text-[104px]">
      {BRAND.toUpperCase()}
    </span>
  );

  const badges = (
    <>
      <span aria-hidden className={`${GLASS} absolute top-[10%] left-0 sm:left-[-16%] lg:left-[-28%]`}>
        <span className="flex size-8 items-center justify-center rounded-xl bg-[var(--lime)] text-[var(--lime-foreground)]">
          <svg
            viewBox="0 0 20 20"
            className="size-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 10.5l3.6 3.6L15.5 6.5" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold">{t.work.saved}</span>
          <span className="num text-2xs text-muted-foreground">
            {formatMoney(LIVE[0].price, 'AMD', t.locale)}
          </span>
        </span>
      </span>

      <span aria-hidden className={`${GLASS} absolute right-0 bottom-[10%] sm:right-[-18%]`}>
        <span className="text-[13px] font-medium">{t.landing.hero.note(TRIAL_DAYS)}</span>
      </span>
    </>
  );

  /* Третий акт: то, ради чего секция и стоит перед ценой. */
  const cta = (
    <div className="flex flex-col items-center">
      <Words
        id="app-title"
        text={l.title}
        className="font-wordmark max-w-[18ch] text-center text-[30px] leading-[1.1] tracking-[-0.015em] uppercase md:text-[52px]"
      />

      <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 md:mt-11">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={l.appStore}
          className="pointer-events-auto inline-flex rounded-lg outline-none transition-transform hover:scale-[1.04] focus-visible:ring-3 focus-visible:ring-[#c0390f]/40 active:translate-y-px dark:focus-visible:ring-[#ff6a2a]/40"
        >
          <Image src="/app-store-badge.svg" alt="" aria-hidden width={158} height={53} />
        </a>

        {/* Оговорка про Android честная: клиент есть, но он в работе, и
            разделов, за которыми нет экрана, в нём не показывают
            (`android/PARITY.md`). */}
        <span className="text-[13px] text-muted-foreground md:text-sm">{l.android}</span>
      </div>
    </div>
  );

  return (
    <section id="app" aria-labelledby="app-title" className="scroll-mt-16 bg-[var(--landing-bg)]">
      <AppStage
        lead={lead}
        brand={brand}
        phone={<Phone src="/app/summary-hy.webp" alt={l.title} />}
        badges={badges}
        cta={cta}
      />
    </section>
  );
}
