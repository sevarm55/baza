import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import { redirect } from 'next/navigation';
import { getRememberedAccount, getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES } from '@/lib/niches';
import { AuthPortal, AuthTrigger } from '@/components/auth-buttons';
import { LanguagePicker } from '@/components/language-picker';
import { CampaignReveal } from './campaign-motion';
import s from './landing.module.css';
import { getDict, getI18n } from '@/lib/i18n/server';

/**
 * Плакатный шрифт витрины — свой на каждую письменность.
 *
 * Noto Sans Armenian Extra-Condensed Black рисует армянский, и только
 * его: латиницы с кириллицей в этом начертании нет вовсе, а подставлять
 * вместо них обычный текстовый шрифт — значит показывать русскому и
 * английскому посетителю совсем другую страницу, без плаката.
 *
 * Для них Unbounded Black. Он широкий там, где армянский узкий, поэтому
 * кегль на этих языках считается с множителем `--ds` — иначе те же
 * слова просто не помещаются в кадр (см. landing.module.css).
 *
 * Кириллица и латиница лежат раздельно, как их отдаёт Google Fonts: два
 * файла по 12 и 21 КБ вместо одного на 200. Браузер подбирает шрифт
 * посимвольно и сам берёт из стека тот, где нужная буква есть, — общий
 * `unicode-range` для этого не нужен.
 */
const armenian = localFont({
  src: './fonts/NotoSansArmenian-XCondBlack.woff2',
  variable: '--font-campaign-display',
  display: 'swap',
});

const unboundedLatin = localFont({
  src: './fonts/Unbounded-Latin-Black.woff2',
  variable: '--font-poster-latin',
  display: 'swap',
});

const unboundedCyrillic = localFont({
  src: './fonts/Unbounded-Cyrillic-Black.woff2',
  variable: '--font-poster-cyrillic',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.meta.landingTitle, description: t.meta.landingDescription };
}

const photo = (name: string) => `/landing/v2/${name}`;

/* Пример зарплатной ведомости на витрине: числа выдуманные и одинаковые
   на всех языках, меняются только имена рядом с ними. */
const CREW = [
  { cars: 18, pay: '27 000' },
  { cars: 14, pay: '21 000' },
  { cars: 21, pay: '31 500' },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const { locale, t } = await getI18n();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  /* Окно открывается адресом, а не только кнопкой: сюда уводят
     `/login`, `/start/…`, прокси и ссылки из писем. Отдельных страниц
     входа больше нет — см. components/auth-buttons.tsx. */
  const { auth } = await searchParams;
  const opened = auth === 'signIn' || auth === 'register' ? auth : null;

  const niche = ACTIVE_NICHES[0]?.key ?? 'carwash';

  /* Армянский остаётся в своём начертании, остальные два переходят на
     Unbounded вместе с пересчётом кегля. */
  const poster =
    locale === 'hy'
      ? armenian.variable
      : `${unboundedLatin.variable} ${unboundedCyrillic.variable} ${s.posterLatin}`;

  return (
    <div className={`${s.page} ${poster}`}>
      <AuthPortal
        initial={opened}
        niche={niche}
        remembered={remembered}
        trialDays={TRIAL_DAYS}
      />

      <a className={s.skipLink} href="#main">
        {t.landing.skip}
      </a>

      <header className={s.navWrap}>
        <nav className={s.nav} aria-label={t.landing.navAria}>
          <Link className={s.wordmark} href="/" aria-label={t.landing.homeAria}>
            <span className={s.mark} aria-hidden="true"><i /><i /></span>
            <span>TETRIN</span>
          </Link>

          <div className={s.navCenter}>
            <a href="#how">{t.landing.navHow}</a>
            <a href="#price">{t.landing.navPrice}</a>
          </div>

          <div className={s.navActions}>
            {/* Язык выбирают до входа, а не внутри окна: окно живёт в
                верхнем слое браузера, и любой выпадающий список в нём
                оказывается под ним. */}
            <LanguagePicker compact />
            <AuthTrigger mode="signIn" className={s.signIn}>
              {t.auth.signInTitle}
            </AuthTrigger>
            <AuthTrigger mode="register" className={s.navCta}>
              {t.landing.start} <span aria-hidden="true">↗</span>
            </AuthTrigger>
          </div>
        </nav>
      </header>

      <main id="main">
        <section className={s.hero}>
          <div className={s.heroFrame}>
            <div className={s.heroPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-01.png')}
                alt={t.landing.heroAlt}
                fill
                preload
                sizes="(max-width: 760px) 100vw, 82vw"
              />
            </div>

            <h1 className={s.heroTitle}>
              <span>{t.landing.heroLine1}</span>
              <span>{t.landing.heroLine2}</span>
            </h1>

            <div className={s.heroCtaCutout}>
              <AuthTrigger mode="register" className={s.heroCta}>
                {t.landing.start} <span aria-hidden="true">↗</span>
              </AuthTrigger>
              <small>{t.landing.trial(TRIAL_DAYS)}</small>
            </div>

            <aside className={s.todayRail} aria-label={t.landing.railAria}>
              <div className={s.railLabel}>TODAY / 10:17</div>
              <div className={s.railMetric}><strong>37</strong><span>{t.landing.carsWord(37)}</span></div>
              <div className={s.railMetric}><strong>245 000 ֏</strong><span>{t.landing.revenueWord}</span></div>
              <div className={`${s.railMetric} ${s.railNet}`}><strong>151 500 ֏</strong><span>{t.landing.netWord}</span></div>
            </aside>
          </div>
        </section>

        <section className={s.tapsScene} id="how">
          <CampaignReveal className={s.tapsPanel}>
            {/* Подпись, заголовок и шаги — одной плитой, как рельс с
                числами на первом экране. Иначе они лежат прямо на поле
                панели, и её край проходит по трём разным линиям. */}
            <div className={s.tapsSide}>
              <div className={s.sceneLabel}>{t.landing.tapsLabel}</div>
              <div className={s.tapsHeading}>
                <span aria-hidden="true">3</span>
                <h2>{t.landing.tapsWord}</h2>
              </div>

              <ol className={s.touchRail}>
                <li><b>01</b><span>{t.landing.tapPlate}</span></li>
                <li><b>02</b><span>{t.landing.tapService}</span></li>
                <li><b>03</b><span>{t.landing.tapPayment}</span></li>
              </ol>
            </div>

            <div className={s.tapsPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-02.png')}
                alt={t.landing.tapsAlt}
                fill
                sizes="(max-width: 760px) 100vw, 48vw"
              />
            </div>

            <div className={s.tapFinish}>
              <span>{t.landing.tapsDone}</span>
              <b aria-hidden="true">✓</b>
            </div>
          </CampaignReveal>
        </section>

        <section className={s.operationScene}>
          <CampaignReveal className={s.operationPanel}>
            <div className={s.operationPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-03.png')}
                alt={t.landing.todayAlt}
                fill
                sizes="100vw"
              />
            </div>
            <div className={s.operationLabel}>{t.landing.todayLabel}</div>
            <h2 className={s.operationTitle}>
              <span>{t.landing.todayLine1}</span>
              <span>{t.landing.todayLine2}</span>
            </h2>
            <div className={s.operationCount}>
              <strong>37</strong>
              <span>{t.landing.carsWord(37)}</span>
            </div>
          </CampaignReveal>
        </section>

        <section className={s.moneyScene}>
          <CampaignReveal className={s.moneyPoster}>
            <div className={s.moneyTopline}>
              <span>{t.landing.moneyLabel}</span>
              <span>AMD</span>
            </div>

            <div className={s.moneyRevenue}>
              <span>{t.landing.moneyRevenue}</span>
              <strong><span dir="ltr">245 000</span><b>֏</b></strong>
            </div>

            <div className={s.moneyDeductions}>
              <div><strong>− 62 000</strong><span>{t.landing.moneyWages}</span></div>
              <div><strong>− 31 500</strong><span>{t.landing.moneyCosts}</span></div>
            </div>

            <div className={s.moneyNet}>
              <span>{t.landing.moneyLeft}</span>
              <strong>151 500 ֏</strong>
            </div>
          </CampaignReveal>
        </section>

        <section className={s.workersScene}>
          <CampaignReveal className={s.workersPanel}>
            <div className={s.workerPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-04.png')}
                alt={t.landing.teamAlt}
                fill
                sizes="(max-width: 760px) 100vw, 43vw"
              />
            </div>

            <div className={s.workerCopy}>
              <div className={s.sceneLabel}>{t.landing.teamLabel}</div>
              <h2>{t.landing.teamLine1}<br />{t.landing.teamLine2}</h2>
              <p>{t.landing.teamNote}</p>

              <div className={s.salaryLines} aria-label={t.landing.teamAria}>
                {CREW.map((line, i) => (
                  <div key={line.pay}>
                    <span>{t.landing.teamNames[i]}</span>
                    <small>{line.cars} {t.landing.carsWord(line.cars)}</small>
                    <strong>{line.pay} ֏</strong>
                  </div>
                ))}
              </div>
            </div>
          </CampaignReveal>
        </section>

        <section className={s.closingScene}>
          <CampaignReveal className={s.closingPanel}>
            <div className={s.closingPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-05.png')}
                alt={t.landing.closingAlt}
                fill
                sizes="100vw"
              />
            </div>
            <div className={s.closingLabel}>{t.landing.closingLabel}</div>
            <h2>{t.landing.closingLine1}<br />{t.landing.closingLine2}</h2>
            <p>{t.landing.closingNote}</p>
          </CampaignReveal>
        </section>

        <section className={s.priceScene} id="price">
          <div className={s.pricePoster}>
            <div className={s.priceIntro}>{t.landing.priceIntro}</div>
            <div className={s.priceValue}>{formatMoney(PRICE, 'AMD')}</div>
            <div className={s.priceMeta}>
              <span>{t.landing.pricePeriod}</span>
              <span>{t.landing.pricePerPoint}</span>
            </div>
            <div className={s.trial}>{t.landing.trial(TRIAL_DAYS)}</div>
            <AuthTrigger mode="register" className={s.priceCta}>
              {t.landing.startLoud} <span aria-hidden="true">↗</span>
            </AuthTrigger>
          </div>

          <footer className={s.footer}>
            <Link className={s.wordmark} href="/">
              <span className={s.mark} aria-hidden="true"><i /><i /></span>
              <span>TETRIN</span>
            </Link>
            <span>{t.landing.footerTag}</span>
            <nav aria-label={t.landing.footerNavAria}>
              <Link href="/privacy">{t.legal.privacy}</Link>
              <Link href="/support">{t.legal.support}</Link>
            </nav>
          </footer>
        </section>
      </main>
    </div>
  );
}

