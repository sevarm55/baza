import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { HeroDemo } from './hero-demo';
import s from './landing.module.css';

/** Цена подписки. Одно место — меняется здесь. */
const PRICE = 15000;

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const L = hy.landing;

  return (
    <div className={s.page}>
      <header className={s.shell}>
        <nav className={s.nav}>
          <span className={s.wordmark}>{hy.app.name.toUpperCase()}</span>
          <div className={s.navLinks}>
            <Link href="/login" className={s.navLink}>
              {hy.auth.signInTitle}
            </Link>
            <Link href="/start" className={s.navLink}>
              {hy.onboarding.createAccount}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={`${s.shell} ${s.hero}`}>
          <div>
            <span className={s.eyebrow}>{L.eyebrow}</span>
            <h1 className={s.headline}>
              {L.headline}
              <span className={s.headlineAccent}>{L.headlineAccent}</span>
            </h1>
            <p className={s.lead}>{L.lead}</p>
            <div className={s.actions}>
              <Link href="/start" className={s.cta}>
                {L.ctaPrimary}
              </Link>
              <span className={s.ctaNote}>{L.ctaNote}</span>
            </div>
          </div>

          <HeroDemo />
        </section>

        {/* Рабочий день мойки — он же порядок разделов.
            Метки времени не украшение: ровно так выглядит лента записей. */}
        <section className={s.day}>
          <div className={s.shell}>
            <div className={s.steps}>
              {L.steps.map((step) => (
                <article key={step.time} className={s.step}>
                  <div className={s.stepTime}>{step.time}</div>
                  <div>
                    <h2 className={s.stepTitle}>{step.title}</h2>
                    <p className={s.stepBody}>{step.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${s.shell} ${s.more}`}>
          <h2 className={s.sectionTitle}>{L.moreTitle}</h2>
          <div className={s.moreGrid}>
            {L.more.map((item) => (
              <div key={item.title} className={s.moreCard}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.price}>
          <div className={s.shell}>
            <h2 className={s.sectionTitle} style={{ marginBottom: 18 }}>
              {L.priceTitle}
            </h2>
            <p className={s.priceValue}>{formatMoney(PRICE)}</p>
            <p className={s.pricePeriod}>{L.pricePeriod}</p>
            <div className={s.priceActions}>
              <Link href="/start" className={s.cta}>
                {L.ctaPrimary}
              </Link>
            </div>
            <p className={s.priceNote}>{L.priceNote}</p>
          </div>
        </section>
      </main>

      <footer className={s.footer}>{L.footer}</footer>
    </div>
  );
}
