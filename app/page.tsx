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
 * Цвета меток времени идут по кругу цветами знака — страница и марка
 * перестают жить отдельными жизнями. Цвет текста едет вместе с фоном:
 * белый читается по грейпу (7.1), но по лайму даёт 1.15 — там нужен
 * тёмно-фиолетовый (13.2).
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
  const more = L.more.filter((item) => !('feature' in item) || passesEnabled());

  return (
    <div className={s.page}>
      {/* Шапка лежит поверх первого экрана: своя белая планка сверху
          разрезала бы афишу пополам. */}
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
        <section className={`${s.band} ${s.hero}`}>
          <div className={s.container}>
            <div className={s.heroText}>
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

            {/* Свешивается на следующий раздел — отсюда взгляд идёт вниз
                сам, без стрелок и подсказок. */}
            <HeroDemo />
          </div>
        </section>

        {/* Три вопроса, которые задают до чтения: сложно ли, сколько стоит
            попробовать, надо ли учиться. Ответы — до текста. */}
        <section className={s.stats}>
          <div className={s.container}>
            <div className={s.statsRow}>
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

        {/* Рабочий день мойки — он же порядок раздела. Метки времени
            не украшение: ровно так выглядит лента записей. */}
        <section className={s.section}>
          <div className={s.container}>
            <div className={s.day}>
              <div className={s.dayHead}>
                <span className={s.kicker}>{L.eyebrow}</span>
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
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.container}>
            <div className={s.moreHead}>
              <h2 className={s.sectionTitle}>{L.moreTitle}</h2>
            </div>

            <div className={s.moreList}>
              {more.map((item, i) => (
                <div key={item.title} className={s.moreItem}>
                  <span className={`${s.moreNum} num`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className={s.moreTitle}>{item.title}</h3>
                  <p className={s.moreBody}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${s.band} ${s.price}`}>
          <div className={s.container}>
            <span className={s.priceEyebrow}>
              <i className={s.priceDot} />
              {L.priceTitle}
            </span>
            <p className={`${s.priceValue} num`}>{formatMoney(PRICE)}</p>
            <p className={s.pricePeriod}>{L.pricePeriod}</p>
            <div>
              <Link href={start} className={s.priceCta}>
                {L.ctaPrimary(TRIAL_DAYS)}
              </Link>
            </div>
            <p className={s.priceNote}>{L.priceNote(TRIAL_DAYS)}</p>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.container}>{L.footer}</div>
      </footer>
    </div>
  );
}
