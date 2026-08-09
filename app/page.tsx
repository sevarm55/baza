import Link from 'next/link';
import { AuthTrigger } from '@/components/auth-buttons';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES } from '@/lib/niches';
import { Logo } from '@/components/logo';
import { OwnerScreen, WorkerScreen } from './screens';
import s from './landing.module.css';

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const L = hy.landing;
  /* Ниша известна заранее: пока она одна, выбирать нечего, и окно
     регистрации открывается сразу с ней. */
  const niche = ACTIVE_NICHES[0]?.key ?? 'carwash';
  const more = L.more.filter((item) => !('feature' in item) || passesEnabled());

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.container}>
          <nav className={s.nav}>
            <Logo size={26} />
            <div className={s.navLinks}>
              {/* Кнопки, а не ссылки: вход и регистрация открываются
                  окном на месте. Адрес при этом не трогается — человеку
                  в этот момент нужна форма, а не переход. */}
              <AuthTrigger mode="signIn" niche={niche} className={s.navLink}>
                {hy.auth.signInTitle}
              </AuthTrigger>
              <AuthTrigger mode="register" niche={niche} className={s.navCta}>
                {hy.onboarding.createAccount}
              </AuthTrigger>
            </div>
          </nav>
        </div>
      </header>

      <main>
        {/* Открытие. Ни плашки, ни картинки: обещание, кнопка во всю
            ширину и три числа — всё, что нужно решить на первом экране. */}
        <section className={`${s.band} ${s.open}`}>
          <div className={s.container}>
            <p className={s.eyebrow}>{L.eyebrow}</p>
            <h1 className={s.headline}>
              {L.headline}
              <span className={s.headlineAccent}>{L.headlineAccent}</span>
            </h1>
            <p className={s.lead}>{L.lead}</p>

            <AuthTrigger mode="register" niche={niche} className={s.cta}>
              {L.ctaPrimary(TRIAL_DAYS)}
            </AuthTrigger>
            <p className={s.ctaNote}>{L.ctaNote}</p>

            <div className={s.numbers}>
              {L.stats(TRIAL_DAYS).map((stat) => (
                <div key={stat.label} className={s.number}>
                  <div className={s.numberValue}>
                    <span className="num">{stat.value}</span>
                    <span className={s.numberUnit}>{stat.unit}</span>
                  </div>
                  <div className={s.numberLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Рабочий день одной лентой. Экраны продукта стоят прямо в ней —
            там, где о них зашла речь, а не отдельной витриной. */}
        <section className={s.section}>
          <div className={s.container}>
            <h2 className={s.sectionTitle}>{L.dayTitle}</h2>

            <ol className={s.line}>
              {L.steps.map((step, i) => (
                <li key={step.time} className={s.moment}>
                  <span className={`${s.time} num`}>{step.time}</span>
                  <h3 className={s.momentTitle}>{step.title}</h3>
                  <p className={s.momentBody}>{step.body}</p>
                  {i === 0 && <WorkerScreen />}
                  {i === 2 && <OwnerScreen />}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <h2 className={s.sectionTitle}>{L.moreTitle}</h2>

            <div className={s.moreList}>
              {more.map((item, i) => (
                <div key={item.title} className={s.moreItem}>
                  <span className={`${s.moreNum} num`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className={s.moreTitle}>{item.title}</h3>
                    <p className={s.moreBody}>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${s.band} ${s.price}`}>
          <div className={s.container}>
            <p className={s.priceLabel}>{L.priceTitle}</p>
            <p className={`${s.priceValue} num`}>{formatMoney(PRICE)}</p>
            <p className={s.pricePeriod}>{L.pricePeriod}</p>
            <AuthTrigger mode="register" niche={niche} className={s.priceCta}>
              {L.ctaPrimary(TRIAL_DAYS)}
            </AuthTrigger>
            <p className={s.priceNote}>{L.priceNote(TRIAL_DAYS)}</p>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.container}>
          {L.footer}
          {/* Обе ссылки обязательны для App Store, но им же и место:
              единственная страница, куда человек придёт сам, — эта. */}
          <div className={s.footerLinks}>
            <Link href="/privacy">{hy.legal.privacy}</Link>
            <Link href="/support">{hy.legal.support}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
