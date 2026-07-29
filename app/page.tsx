import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { startHref } from '@/lib/niches';
import { Logo } from '@/components/logo';
import { HeroDemo } from './hero-demo';
import s from './landing.module.css';

/**
 * Цвета шагов идут по кругу цветами знака — страница и марка перестают
 * жить отдельными жизнями. Цвет текста едет вместе с фоном и меняется
 * вместе с ним: белый читается по грейпу (7.1), но по лайму даёт 1.15 —
 * там нужен тёмно-фиолетовый (13.2).
 */
const STEP_COLORS = [
  { bg: 'var(--color-brand-1)', ink: '#ffffff' },
  { bg: 'var(--color-brand-2)', ink: '#2e1065' },
  { bg: 'var(--color-brand-3)', ink: '#2e1065' },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const L = hy.landing;
  const start = startHref();

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.container}>
          <nav className={s.nav}>
            <Logo size={28} />
            <div className={s.navLinks}>
              <Link href="/login" className={s.navLink}>
                {hy.auth.signInTitle}
              </Link>
              <Link href={start} className={s.navCta}>
                {hy.onboarding.createAccount}
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main>
        {/* Первый экран и три обещания — одна грейповая полоса. Человек
            получает ответы на «сложно ли», «сколько стоит попробовать» и
            «надо ли учиться», не уходя со стартового экрана. */}
        <section className={`${s.band} ${s.hero}`}>
          <div className={s.container}>
            <div className={s.heroInner}>
              <div>
                <span className={s.eyebrow}>
                  <i className={s.eyebrowDot} />
                  {L.eyebrow}
                </span>
                <h1 className={s.headline}>
                  {L.headline}
                  <span className={s.headlineAccent}>{L.headlineAccent}</span>
                </h1>
                <p className={s.lead}>{L.lead}</p>
                <div className={s.actions}>
                  <Link href={start} className={s.cta}>
                    {L.ctaPrimary(TRIAL_DAYS)}
                  </Link>
                  <span className={s.ctaNote}>{L.ctaNote}</span>
                </div>
              </div>

              <HeroDemo />
            </div>

            <div className={s.heroStats}>
              {L.stats(TRIAL_DAYS).map((stat) => (
                <div key={stat.label} className={s.stat}>
                  <div className={s.statValue}>
                    <span className="num">{stat.value}</span>
                    <span className={s.statUnit}>{stat.unit}</span>
                  </div>
                  <div className={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Рабочий день мойки — он же порядок разделов.
            Метки времени не украшение: ровно так выглядит лента записей. */}
        <section className={s.section}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <span className={s.sectionKicker}>{L.eyebrow}</span>
              <h2 className={s.sectionTitle}>{L.dayTitle}</h2>
            </div>

            <div className={s.steps}>
              {L.steps.map((step, i) => {
                const color = STEP_COLORS[i % STEP_COLORS.length];
                return (
                  <article
                    key={step.time}
                    className={s.step}
                    style={
                      {
                        '--step-color': color.bg,
                        '--step-ink': color.ink,
                      } as CSSProperties
                    }
                  >
                    <div className={s.stepTime}>{step.time}</div>
                    <h3 className={s.stepTitle}>{step.title}</h3>
                    <p className={s.stepBody}>{step.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>{L.moreTitle}</h2>
            </div>

            <div className={s.moreGrid}>
              {L.more
                .filter((item) => !('feature' in item) || passesEnabled())
                .map((item) => (
                  <div key={item.title} className={s.moreCard}>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className={`${s.band} ${s.price} ${s.section}`}>
          <div className={s.container}>
            <div className={s.priceInner}>
              <div>
                <span className={s.eyebrow}>
                  <i className={s.eyebrowDot} />
                  {L.priceTitle}
                </span>
                <p className={`${s.priceValue} num`}>{formatMoney(PRICE)}</p>
                <p className={s.pricePeriod}>{L.pricePeriod}</p>
              </div>

              <div className={s.priceActions}>
                <Link href={start} className={s.cta}>
                  {L.ctaPrimary(TRIAL_DAYS)}
                </Link>
                <p className={s.priceNote}>{L.priceNote(TRIAL_DAYS)}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.container}>{L.footer}</div>
      </footer>
    </div>
  );
}
