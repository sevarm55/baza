import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import { redirect } from 'next/navigation';
import { getRememberedAccount, getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES } from '@/lib/niches';
import { AuthTrigger } from '@/components/auth-buttons';
import { CampaignReveal } from './campaign-motion';
import s from './landing.module.css';

const display = localFont({
  src: './fonts/NotoSansArmenian-XCondBlack.woff2',
  variable: '--font-campaign-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tetrin | Ավտոլվացումը ձեր վերահսկողության տակ',
  description:
    'Մեքենաները, աշխատողները, աշխատավարձն ու մաքուր արդյունքը մեկ պարզ համակարգում։',
};

const photo = (name: string) => `/landing/v2/${name}`;

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  const niche = ACTIVE_NICHES[0]?.key ?? 'carwash';

  return (
    <div className={`${s.page} ${display.variable}`}>
      <a className={s.skipLink} href="#main">
        Անցնել հիմնական բովանդակությանը
      </a>

      <header className={s.navWrap}>
        <nav className={s.nav} aria-label="Հիմնական նավիգացիա">
          <Link className={s.wordmark} href="/" aria-label="Tetrin գլխավոր էջ">
            <span className={s.mark} aria-hidden="true"><i /><i /></span>
            <span>TETRIN</span>
          </Link>

          <div className={s.navCenter}>
            <a href="#how">Ինչպես է աշխատում</a>
            <a href="#price">Գին</a>
          </div>

          <div className={s.navActions}>
            <AuthTrigger mode="signIn" niche={niche} remembered={remembered} className={s.signIn}>
              {hy.auth.signInTitle}
            </AuthTrigger>
            <AuthTrigger mode="register" niche={niche} className={s.navCta}>
              Սկսել <span aria-hidden="true">↗</span>
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
                alt="Թաց գրաֆիտագույն մեքենա և աշխատող ավտոլվացման մութ բոքսում"
                fill
                preload
                sizes="(max-width: 760px) 100vw, 82vw"
              />
            </div>

            <h1 className={s.heroTitle}>
              <span>ԱՄԵՆ ՄԵՔԵՆԱՆ՝</span>
              <span>ԳՐԱՆՑՎԱԾ։</span>
            </h1>

            <div className={s.heroCtaCutout}>
              <AuthTrigger mode="register" niche={niche} className={s.heroCta}>
                Սկսել <span aria-hidden="true">↗</span>
              </AuthTrigger>
              <small>{TRIAL_DAYS} օր անվճար</small>
            </div>

            <aside className={s.todayRail} aria-label="Այսօրվա հիմնական թվերը">
              <div className={s.railLabel}>TODAY / 10:17</div>
              <div className={s.railMetric}><strong>37</strong><span>մեքենա</span></div>
              <div className={s.railMetric}><strong>245 000 ֏</strong><span>հասույթ</span></div>
              <div className={`${s.railMetric} ${s.railNet}`}><strong>151 500 ֏</strong><span>մաքուր</span></div>
            </aside>
          </div>
        </section>

        <section className={s.tapsScene} id="how">
          <CampaignReveal className={s.tapsPanel}>
            {/* Подпись, заголовок и шаги — одной плитой, как рельс с
                числами на первом экране. Иначе они лежат прямо на поле
                панели, и её край проходит по трём разным линиям. */}
            <div className={s.tapsSide}>
              <div className={s.sceneLabel}>01 / ԳՐԱՆՑՈՒՄ</div>
              <div className={s.tapsHeading}>
                <span aria-hidden="true">3</span>
                <h2>ՀՊՈՒՄ</h2>
              </div>

              <ol className={s.touchRail}>
                <li><b>01</b><span>Համարանիշ</span></li>
                <li><b>02</b><span>Ծառայություն</span></li>
                <li><b>03</b><span>Վճարում</span></li>
              </ol>
            </div>

            <div className={s.tapsPhoto}>
              <Image
                className={s.photoImage}
                src={photo('carwash-02.png')}
                alt="Ճնշման ջրի շիթը մեքենայի վրա և աշխատողի ձեռքում հեռախոս"
                fill
                sizes="(max-width: 760px) 100vw, 48vw"
              />
            </div>

            <div className={s.tapFinish}>
              <span>Գրանցված է</span>
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
                alt="Երկու աշխատող մութ ավտոլվացման բոքսում լվանում են մեքենաները"
                fill
                sizes="100vw"
              />
            </div>
            <div className={s.operationLabel}>02 / ԱՅՍՕՐ</div>
            <h2 className={s.operationTitle}>
              <span>ԱՄԵՆ ԻՆՉ</span>
              <span>ՏԵՍԱՆԵԼԻ Է։</span>
            </h2>
            <div className={s.operationCount}>
              <strong>37</strong>
              <span>մեքենա</span>
            </div>
          </CampaignReveal>
        </section>

        <section className={s.moneyScene}>
          <CampaignReveal className={s.moneyPoster}>
            <div className={s.moneyTopline}>
              <span>03 / ՕՐԸ ԹՎԵՐՈՎ</span>
              <span>AMD</span>
            </div>

            <div className={s.moneyRevenue}>
              <span>Հասույթ</span>
              <strong><span dir="ltr">245 000</span><b>֏</b></strong>
            </div>

            <div className={s.moneyDeductions}>
              <div><strong>− 62 000</strong><span>աշխատավարձ</span></div>
              <div><strong>− 31 500</strong><span>ծախսեր</span></div>
            </div>

            <div className={s.moneyNet}>
              <span>Ձեզ մնում է։</span>
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
                alt="Ավտոլվացման աշխատողը թաց մեքենայի կողքին նայում է հեռախոսին"
                fill
                sizes="(max-width: 760px) 100vw, 43vw"
              />
            </div>

            <div className={s.workerCopy}>
              <div className={s.sceneLabel}>04 / ԹԻՄ</div>
              <h2>ՈՉ ՄԻ<br />ՀԱՇՎԻՉ։</h2>
              <p>Աշխատավարձը հաշվվում է ինքն իրեն։</p>

              <div className={s.salaryLines} aria-label="Աշխատողների հաշվարկված աշխատավարձերը">
                <div><span>Արման</span><small>18 մեքենա</small><strong>27 000 ֏</strong></div>
                <div><span>Գոռ</span><small>14 մեքենա</small><strong>21 000 ֏</strong></div>
                <div><span>Հայկ</span><small>21 մեքենա</small><strong>31 500 ֏</strong></div>
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
                alt="Մաքուր գրաֆիտագույն մեքենան դուրս է գալիս ավտոլվացումից դեպի լույս"
                fill
                sizes="100vw"
              />
            </div>
            <div className={s.closingLabel}>05 / ՊԱՐԶ ԱՐԴՅՈՒՆՔ</div>
            <h2>ՕՐԸ<br />ՊԱՐԶ Է։</h2>
            <p>Մեքենաները, գումարն ու թիմը՝ մեկ տեղում։</p>
          </CampaignReveal>
        </section>

        <section className={s.priceScene} id="price">
          <div className={s.pricePoster}>
            <div className={s.priceIntro}>ՊԱՐԶ ԳԻՆ</div>
            <div className={s.priceValue}>{formatMoney(PRICE, 'AMD')}</div>
            <div className={s.priceMeta}>
              <span>ամսական</span>
              <span>մեկ մասնաճյուղի համար</span>
            </div>
            <div className={s.trial}>{TRIAL_DAYS} օր անվճար</div>
            <AuthTrigger mode="register" niche={niche} className={s.priceCta}>
              ՍԿՍԵԼ <span aria-hidden="true">↗</span>
            </AuthTrigger>
          </div>

          <footer className={s.footer}>
            <Link className={s.wordmark} href="/">
              <span className={s.mark} aria-hidden="true"><i /><i /></span>
              <span>TETRIN</span>
            </Link>
            <span>Հաշվառում ավտոլվացումների համար</span>
            <nav aria-label="Իրավական և աջակցություն">
              <Link href="/privacy">{hy.legal.privacy}</Link>
              <Link href="/support">{hy.legal.support}</Link>
            </nav>
          </footer>
        </section>
      </main>
    </div>
  );
}

