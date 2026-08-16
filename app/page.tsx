import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRememberedAccount, getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES, getNiche } from '@/lib/niches';
import { appStoreUrl } from '@/lib/features';
import { AuthPortal, AuthTrigger } from '@/components/auth-buttons';
import { LanguagePicker } from '@/components/language-picker';
import { Logo } from '@/components/logo';
import { getDict } from '@/lib/i18n/server';
import { LandingWorkspace } from './landing-workspace';
import { NavShadow } from './landing-motion';
import s from './landing.module.css';

/**
 * Витрина.
 *
 * Раньше здесь был плакат: пять полноэкранных снимков мойки и заголовки
 * капсом в двести пунктов. Он рассказывал, что Tetrin существует, но не
 * показывал ни одного экрана продукта — а покупают здесь именно экран.
 *
 * Теперь страница и есть продукт. Вступление занимает верхнюю треть
 * первого экрана, дальше начинается рабочая панель, и всё остальное —
 * один рабочий день внутри неё: машину записали, день сложился, зарплата
 * посчиталась, расход вписали, в конце осталось одно число. Приборы в
 * панели настоящие — те же компоненты, что рисуют сводку в кабинете, и
 * разойтись с продуктом они не могут.
 *
 * Что осталось прежним и меняться не должно: вход и регистрация живут
 * ТОЛЬКО в окне (`components/auth-buttons.tsx`), язык выбирают в шапке
 * до входа, `/?auth=signIn` открывает окно прямо с адреса, а вошедшего
 * страница вообще не показывает — он уходит в свой кабинет.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.meta.landingTitle, description: t.meta.landingDescription };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  /* Окно открывается адресом, а не только кнопкой: сюда уводят
     `/login`, `/start/…`, прокси и ссылки из писем. Отдельных страниц
     входа больше нет — см. components/auth-buttons.tsx. */
  const { auth } = await searchParams;
  const opened = auth === 'signIn' || auth === 'register' ? auth : null;

  /* Ниша показа берётся из конфига, а не вписана в витрину руками.

     Слова бизнеса — «մեքենա», «Լվացող», «Պետհամարանիշ» — приезжают
     оттуда же, откуда их получает настоящий бизнес при регистрации, и
     переводятся тем же `lib/i18n/terms.ts`. Включат вторую нишу —
     витрина заговорит её словами, а не останется навсегда про мойки
     (см. lib/niches.ts). */
  const niche = ACTIVE_NICHES[0] ?? getNiche('carwash');
  const l = t.landing;

  /* Ссылки на приложение может ещё не быть: iOS ждёт ревью, и адрес
     появляется вместе с публикацией. Выдумывать его нельзя. */
  const appStore = appStoreUrl();

  return (
    <div className={s.page}>
      <AuthPortal
        initial={opened}
        niche={niche.key}
        remembered={remembered}
        trialDays={TRIAL_DAYS}
      />

      <a className={s.skipLink} href="#main">
        {l.nav.skip}
      </a>

      <NavShadow className={s.navWrap}>
        <nav className={s.nav} aria-label={l.nav.navAria}>
          <Link className={s.brand} href="/" aria-label={l.nav.homeAria}>
            <Logo size={26} withName={false} />
            <span className={s.brandName}>{t.app.name.toUpperCase()}</span>
          </Link>

          <div className={s.navCenter}>
            <a href="#product">{l.nav.product}</a>
            <a href="#how">{l.nav.how}</a>
            <a href="#price">{l.nav.price}</a>
          </div>

          <div className={s.navActions}>
            {/* Язык выбирают до входа, а не внутри окна: окно живёт в
                верхнем слое браузера, и любой выпадающий список в нём
                оказывается под ним. */}
            <LanguagePicker compact />
            <AuthTrigger mode="signIn" className={s.ghost}>
              {t.auth.signInTitle}
            </AuthTrigger>
            <AuthTrigger mode="register" className={s.cta}>
              {l.nav.start} <span aria-hidden="true">↗</span>
            </AuthTrigger>
          </div>
        </nav>
      </NavShadow>

      <main id="main">
        {/* Вступление. Верхняя треть первого экрана и не больше: главный
            герой страницы — панель под ним, и заголовок не должен с ней
            соревноваться. */}
        <section className={s.hero} id="product">
          <p className={s.eyebrow}>{l.hero.eyebrow}</p>
          <h1 className={s.heroTitle}>{l.hero.title}</h1>
          <p className={s.heroLead}>{l.hero.lead}</p>

          <div className={s.heroActions}>
            <AuthTrigger mode="register" className={s.cta}>
              {l.hero.cta} <span aria-hidden="true">↗</span>
            </AuthTrigger>
            <a className={s.ghost} href="#how">
              {l.hero.secondary} <span aria-hidden="true">↓</span>
            </a>
            <span className={s.heroNote}>{l.hero.note(TRIAL_DAYS)}</span>
          </div>

          <p className={s.heroCaption}>{l.hero.caption}</p>
        </section>

        {/* Рабочий день. Дальше вся страница — одна панель, которая
            перестраивается по мере чтения. */}
        <section className={s.stage} id="how" aria-label={l.nav.how}>
          <LandingWorkspace unitOne={niche.unitOne} staffRole={niche.staffRole} />
        </section>

        {/* Цена. Один продукт — одна цена: трёх выдуманных тарифов здесь
            нет, потому что их нет и в продукте. */}
        <section className={s.price} id="price">
          <div className={s.pricePanel}>
            <div>
              <div className={s.priceMain}>
                <span className={s.priceLead}>{l.price.title}</span>
                <span className={s.priceValue}>{formatMoney(PRICE, 'AMD', t.locale)}</span>
              </div>
              <div className={s.priceMeta}>
                <span>{l.price.per}</span>
                <i aria-hidden />
                <span>{l.price.point}</span>
                <i aria-hidden />
                <span>{l.price.trial(TRIAL_DAYS)}</span>
              </div>
            </div>

            <div className={s.priceActions}>
              <AuthTrigger mode="register" className={s.cta}>
                {l.hero.cta} <span aria-hidden="true">↗</span>
              </AuthTrigger>
              <span className={s.heroNote}>{l.price.note}</span>
            </div>
          </div>
        </section>

        {/* Приложение.

            Витрина показала рабочую панель на компьютере; здесь сказано,
            что та же панель лежит в кармане. Огромного телефона в
            перспективе нет намеренно: показываем не устройство, а
            кусок самого экрана, теми же числами, что и вся страница. */}
        <section className={s.mobile} aria-labelledby="app-title">
          <div className={s.mobilePanel}>
            <div className={s.mobileCopy}>
              <h2 className={s.mobileTitle} id="app-title">
                {l.app.title}
              </h2>
              <p className={s.mobileLead}>{l.app.lead}</p>

              <div className={s.stores}>
                {appStore ? (
                  <a
                    className={s.store}
                    href={appStore}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={l.app.appStore}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/app-store-badge.svg" alt="" width={132} height={44} aria-hidden />
                  </a>
                ) : (
                  /* Знак без ссылки, потому что вести пока некуда. Он не
                     кнопка и не притворяется ею: ни курсора-руки, ни
                     подсветки — рядом стоит слово «скоро». */
                  <span className={`${s.store} ${s.storeSoon}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/app-store-badge.svg" alt={l.app.appStore} width={132} height={44} />
                    <em>{l.app.soon}</em>
                  </span>
                )}

                <span className={s.storeNote}>{l.app.android}</span>
              </div>
            </div>

            {/* Кусок экрана приложения. Не снимок, а тот же интерфейс:
                на снимке числа застыли бы на дне съёмки и разошлись с
                теми, что стоят выше на этой же странице.

                Для читалки он спрятан: все эти числа уже прочитаны в
                рабочей панели выше, и второй раз они только мешают. */}
            <div className={s.phone} aria-hidden>
              <div className={s.phoneSeg}>
                {l.demo.periods.map((label, i) => (
                  <span key={label} data-on={i === 0 ? '' : undefined}>
                    {label}
                  </span>
                ))}
              </div>

              <div className={s.phoneHero}>
                <span>{t.owner.revenue}</span>
                <strong>{formatMoney(248_000, 'AMD', t.locale)}</strong>
                <small>
                  {l.demo.avgCheck} {formatMoney(6_703, 'AMD', t.locale)}
                </small>
              </div>

              <div className={s.phoneCard}>
                <div className={s.phoneCardHead}>
                  <span>{t.owner.profit}</span>
                  <b>{formatMoney(151_500, 'AMD', t.locale)}</b>
                </div>
                <div className={s.phoneLine}>
                  <span>{t.owner.revenue}</span>
                  <b>{formatMoney(248_000, 'AMD', t.locale)}</b>
                </div>
                <div className={s.phoneLine}>
                  <span>{t.owner.payrollAccrued}</span>
                  <b>− {formatMoney(62_000, 'AMD', t.locale)}</b>
                </div>
                <div className={s.phoneLine}>
                  <span>{t.expenses.title}</span>
                  <b>− {formatMoney(34_500, 'AMD', t.locale)}</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Итог. Панели здесь уже нет — её работа закончилась, и остаётся
            только то, ради чего всё это считалось. */}
        <section className={s.closing}>
          <Logo size={34} withName={false} />
          <h2 className={s.closingTitle}>
            {l.closing.title}
            <span>{l.closing.titleAccent}</span>
          </h2>

          <div className={s.closingActions}>
            <AuthTrigger mode="register" className={s.cta}>
              {l.hero.cta} <span aria-hidden="true">↗</span>
            </AuthTrigger>
            <span className={s.heroNote}>{l.closing.note(TRIAL_DAYS)}</span>
          </div>
        </section>

        <footer className={s.footer}>
          <span>
            {t.app.name} · {l.footer}
          </span>
          <nav aria-label={l.nav.footerAria}>
            <Link href="/privacy">{t.legal.privacy}</Link>
            <Link href="/support">{t.legal.support}</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
