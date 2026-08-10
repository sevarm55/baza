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
      <main>
        {/* Разворот: слева слово, справа цвет во всю высоту.

            Шапка живёт внутри левой половины, а не полосой над всей
            страницей: полоса поверх цветного блока разрезала бы его
            надвое, а он тут работает именно целым — тем, что упирается
            в него взгляд, дойдя до конца заголовка. */}
        <section className={s.stage}>
          <div className={s.left}>
            <div className={s.bar}>
              <nav className={s.pillNav}>
                <Logo size={30} />
                <AuthTrigger mode="signIn" niche={niche} className={s.pillLink}>
                  {hy.auth.signInTitle}
                </AuthTrigger>
                <Link href="#day" className={s.pillLink}>
                  {L.dayTitle}
                </Link>
                <Link href="#price" className={s.pillLink}>
                  {L.priceTitle}
                </Link>
              </nav>

              <div className={s.rounds}>
                <AuthTrigger
                  mode="register"
                  niche={niche}
                  className={s.round}
                  aria-label={hy.onboarding.createAccount}
                >
                  <Plus />
                </AuthTrigger>
              </div>
            </div>

            <h1 className={s.title}>
              {L.headline}
              <span className={s.titleMark} aria-hidden />
            </h1>

            <div className={s.leaf} aria-hidden />

            <div className={s.foot}>
              <div className={s.bigActions}>
                <AuthTrigger mode="register" niche={niche} className={s.bigCta}>
                  {L.ctaPrimary(TRIAL_DAYS)}
                </AuthTrigger>
                <AuthTrigger
                  mode="register"
                  niche={niche}
                  className={`${s.round} ${s.arrow}`}
                  aria-label={L.ctaPrimary(TRIAL_DAYS)}
                >
                  <ArrowUpRight />
                </AuthTrigger>
              </div>
              <p className={s.footText}>{L.lead}</p>
            </div>
          </div>

          {/* Правая половина: продукт настоящими блоками продукта, а не
              картинкой. Нарисованный отдельно снимок отстаёт от продукта
              на следующий же день — так уже было. */}
          <aside className={s.panel}>
            <div className={s.panelShot}>
              <OwnerScreen />
            </div>

            <div className={s.sticker}>
              <span className={s.stickerLabel}>{hy.owner.revenueToday}</span>
              <span className={`num ${s.stickerValue}`}>{formatMoney(31000)}</span>
            </div>

            <div className={s.card}>
              <div className={`num ${s.cardTitle}`}>{formatMoney(PRICE)}</div>
              <p className={s.cardNote}>
                {L.priceNote(TRIAL_DAYS)}
              </p>
              <AuthTrigger mode="register" niche={niche} className={s.cardCta}>
                {L.ctaPrimary(TRIAL_DAYS)}
              </AuthTrigger>
            </div>
          </aside>
        </section>

        {/* Числа — полосой во всю ширину, между двумя жирными
            линиями. Тремя карточками они читались тремя утверждениями;
            полосой читаются одним. */}
        <section className={s.full}>
          <div className={s.strip}>
            {L.stats(TRIAL_DAYS).map((stat) => (
              <div key={stat.label} className={s.stripCell}>
                <div className={s.stripValue}>
                  <span className="num">{stat.value}</span>{' '}
                  <span className={s.stripUnit}>{stat.unit}</span>
                </div>
                <div className={s.stripLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Рабочий день — плитами встык, тонами продукта. Зазор
            превратил бы их в четыре карточки на фоне, а это одна лента,
            разделённая цветом. */}
        <section className={s.full} id="day">
          <h2 className={s.big}>{L.dayTitle}</h2>

          <div className={s.slabs}>
            {L.steps.map((step, i) => {
              const tone = SLABS[i % SLABS.length];
              return (
                <div
                  key={step.time}
                  className={s.slab}
                  style={{ background: tone.bg, color: tone.ink }}
                >
                  <span className={`${s.slabTime} num`}>{step.time}</span>
                  <h3 className={s.slabTitle}>{step.title}</h3>
                  <p className={s.slabBody}>{step.body}</p>
                </div>
              );
            })}
          </div>

          {/* Снимки на своей тёмной плите: на светлом полотне они
              выглядели вырезанными и наклеенными. */}
          <div className={s.showcase}>
            <div className={s.showcaseGrid}>
              <WorkerScreen />
              <OwnerScreen />
            </div>
          </div>
        </section>

        {/* «И ещё» — строками во всю ширину. Сеткой карточек это
            читалось перечнем возможностей, а нужен список ответов на
            вопросы, которые задают. */}
        <section className={s.full}>
          <h2 className={s.big}>{L.moreTitle}</h2>

          <div className={s.lines}>
            {more.map((item, i) => (
              <div key={item.title} className={s.line2}>
                <span className={`${s.lineNum} num`}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className={s.lineTitle}>{item.title}</h3>
                <p className={s.lineBody}>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Цена — самая громкая плита и последняя. */}
        <section className={s.full} id="price">
          <div className={s.deal}>
            <div>
              <p className={s.dealLabel}>{L.priceTitle}</p>
              <p className={`${s.dealValue} num`}>{formatMoney(PRICE)}</p>
              <p className={s.dealPeriod}>{L.pricePeriod}</p>
            </div>
            <div className={s.dealSide}>
              <AuthTrigger mode="register" niche={niche} className={s.dealCta}>
                {L.ctaPrimary(TRIAL_DAYS)}
              </AuthTrigger>
              <p className={s.dealNote}>{L.priceNote(TRIAL_DAYS)}</p>
            </div>
          </div>
        </section>

        <footer className={s.full}>
          <div className={s.bottom}>
            <span>{L.footer}</span>
            {/* Обе ссылки обязательны для App Store, но им же и место:
                единственная страница, куда человек придёт сам, — эта. */}
            <span className={s.footerLinks}>
              <Link href="/privacy">{hy.legal.privacy}</Link>
              <Link href="/support">{hy.legal.support}</Link>
            </span>
          </div>
        </footer>
      </main>

    </div>
  );
}

/* Тона плит рабочего дня — те же пять, которыми в продукте светятся
   плитки. Витрина и прибор должны быть об одном: человек, дошедший до
   кабинета, обязан узнать цвета, которые видел на странице. */
const SLABS = [
  { bg: '#5b21b6', ink: '#f2f0ec' },
  { bg: '#0f766e', ink: '#f2f0ec' },
  { bg: '#d7ff00', ink: '#1a1626' },
  { bg: '#12111a', ink: '#f2f0ec' },
] as const;

/* Знаки первого экрана. Тот же контур 1.5 по сетке 16, что у всех
   значков продукта: витрина говорит громче кабинета, но говорит на его
   языке. */
function Plus() {
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

function ArrowUpRight() {
  return (
    <svg viewBox="0 0 16 16" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}
