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

            <div className={s.leaf} aria-hidden>
              <div className={s.dots}>
                {['#7c3aed', '#0d9488', '#d97706', '#a3e635'].map((c) => (
                  <span key={c} className={s.dot} style={{ background: c }} />
                ))}
              </div>
            </div>

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
