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
        {/* Первый экран в две половины: слева обещание и кнопка,
            справа место под снимок продукта. На телефоне снимок уходит
            вниз — там сначала читают, потом смотрят. */}
        <section className={`${s.container} ${s.open}`}>
          <div className={s.hero}>
            <div>
              <p className={s.eyebrow}>{L.eyebrow}</p>
              <h1 className={s.headline}>
                {L.headline}
                <span className={s.headlineAccent}>{L.headlineAccent}</span>
              </h1>
              <p className={s.lead}>{L.lead}</p>

              <div className={s.actions}>
                <AuthTrigger mode="register" niche={niche} className={s.cta}>
                  {L.ctaPrimary(TRIAL_DAYS)}
                </AuthTrigger>
                <p className={s.ctaNote}>{L.ctaNote}</p>
              </div>
            </div>

            {/* Место под снимок продукта. Пока файла нет — то же полотно
                со свечением, что и внутри: пусто, но не поломано.
                Картинка подставится одной строкой в .shot, когда будет. */}
            <div className={s.shot} aria-hidden />
          </div>
        </section>

        <section className={`${s.container} ${s.line}`}>
          <div className={s.numbers}>
            {L.stats(TRIAL_DAYS).map((stat) => (
              <div key={stat.label} className={s.number}>
                <div className={s.numberValue}>
                  <span className="num">{stat.value}</span>{' '}
                  <span className={s.numberUnit}>{stat.unit}</span>
                </div>
                <div className={s.numberLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Рабочий день одной лентой. Экраны продукта стоят прямо в ней —
            там, где о них зашла речь, а не отдельной витриной. */}
        {/* Рабочий день сеткой, а не лентой: четыре момента видно
            разом, и человек складывает из них картину сам. Лентой их
            приходилось листать, а последний — расчёт зарплаты, ради
            которого сюда и приходят, — оказывался за краем экрана. */}
        <section className={`${s.container} ${s.band} ${s.line}`}>
          <h2 className={s.sectionTitle}>{L.dayTitle}</h2>

          <div className={s.map}>
            {L.steps.map((step) => (
              <div key={step.time} className={s.moment}>
                <span className={`${s.time} num`}>{step.time}</span>
                <h3 className={s.momentTitle}>{step.title}</h3>
                <p className={s.momentBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Экраны продукта — во всю ширину, между рассказом и ценой:
            показать раньше, чем назвать сумму. */}
        <section className={`${s.container} ${s.band}`} style={{ paddingTop: 0 }}>
          <div className={s.map}>
            <WorkerScreen />
            <OwnerScreen />
          </div>
        </section>

        <section className={`${s.container} ${s.band} ${s.line}`} style={{ paddingTop: 'clamp(40px,5vw,72px)' }}>
          <div>
            <h2 className={s.sectionTitle}>{L.moreTitle}</h2>

            <div className={s.moreList}>
              {more.map((item, i) => (
                <div key={item.title} className={s.moreItem}>
                  <span className={`${s.moreNum} num`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className={s.moreItemTitle}>{item.title}</h3>
                  <p className={s.moreBody}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${s.container} ${s.band}`}>
          <div className={s.price}>
            <div>
              <p className={s.priceLabel}>{L.priceTitle}</p>
              <p className={`${s.priceValue} num`}>{formatMoney(PRICE)}</p>
              <p className={s.pricePeriod}>{L.pricePeriod}</p>
            </div>
            <div className={s.priceSide}>
              <AuthTrigger mode="register" niche={niche} className={s.priceCta}>
                {L.ctaPrimary(TRIAL_DAYS)}
              </AuthTrigger>
              <p className={s.priceNote}>{L.priceNote(TRIAL_DAYS)}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${s.container} ${s.line}`}>
        <div className={s.footer}>
          <span>{L.footer}</span>
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
