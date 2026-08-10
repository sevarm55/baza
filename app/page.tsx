import Link from 'next/link';
import Image from 'next/image';
import localFont from 'next/font/local';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES } from '@/lib/niches';
import { AuthTrigger } from '@/components/auth-buttons';
import { Reveal, RevealMedia } from './landing-motion';
import s from './landing.module.css';

/**
 * Витрина.
 *
 * Плакат: сплошные плиты цвета во всю ширину, огромный плотный заголовок
 * и один предмет на кадре. Плиты чередуются, и смена цвета сама отбивает
 * экраны друг от друга — линейки и заголовки разделов не нужны.
 *
 * Кадры сняты под этот приём: у каждого сплошная заливка ровно того
 * цвета, на который он ложится, поэтому снимок не «картинка в блоке», а
 * часть плиты. Сама мойка на них сгенерирована — это иллюстрация, а не
 * свидетельство (PRODUCT.md). Экраны продукта, наоборот, настоящие:
 * сняты с демо-бизнеса, армянский интерфейс, живые числа.
 *
 * Страница остаётся серверной. Клиентского здесь два: кнопки, которые
 * открывают окно входа, и появление блоков при прокрутке.
 */

/* Плотный гротеск витрины. Два вызова, а не один с двумя файлами:
   подстановка по глифам должна идти списком font-family, где порядок
   определён стандартом. У Anton нет армянского, у Noto — латиницы в
   этой подрезке, и вместе они закрывают всё, что есть на странице. */
const anton = localFont({
  src: './fonts/Anton-Regular.woff2',
  variable: '--font-anton',
  display: 'swap',
});

const armDisplay = localFont({
  src: './fonts/NotoSansArmenian-XCondBlack.woff2',
  variable: '--font-arm-display',
  display: 'swap',
});

/* Кадр и экран для каждого шага. Порядок совпадает с hy.landing.steps.
   Цвет плиты подобран под заливку снимка: синий кадр ложится на синюю
   плиту, лаймовый — на лаймовую. */
const STEPS = [
  // fade — там, где модель обрезала человека и низ кадра надо растворить
  { photo: '/landing/bright/phone.jpg', screen: '/landing/screen-staff.png', tone: 'lime', shape: 'tall', fade: true },
  { photo: '/landing/bright/worker.jpg', screen: '/landing/screen-feed.png', tone: 'blue', shape: 'square', fade: true },
  { photo: '/landing/bright/cash.jpg', screen: '/landing/screen-payroll.png', tone: 'blue', shape: 'square', fade: true },
  { photo: '/landing/bright/chem.jpg', screen: '/landing/screen-today.png', tone: 'lime', shape: 'tall', fade: false },
] as const;

/* Снимок экрана — 390×844 при тройной плотности, ужат до 780 по ширине. */
const SCREEN_W = 780;
const SCREEN_H = 1688;

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');

  const L = hy.landing;
  /* Ниша известна заранее: пока продаётся только автомойка, выбирать
     нечего, и окно регистрации открывается сразу с ней. */
  const niche = ACTIVE_NICHES[0]?.key ?? 'carwash';

  return (
    <div className={`${s.page} ${anton.variable} ${armDisplay.variable}`}>
      <header className={s.bar}>
        <span className={`${s.brand} ${s.wordmark}`}>{hy.app.name}</span>
        <div className={s.barActions}>
          <AuthTrigger mode="signIn" niche={niche} className={s.ghost}>
            {hy.auth.signInTitle}
          </AuthTrigger>
          <AuthTrigger mode="register" niche={niche} className={s.cta}>
            {L.ctaPrimary(TRIAL_DAYS)}
          </AuthTrigger>
        </div>
      </header>

      <main>
        <section className={`${s.hero} ${s.blue}`}>
          <Reveal onMount>
            <p className={s.eyebrow}>{L.eyebrow}</p>
            <h1 className={s.h1}>{L.headline}</h1>
            <p className={s.lead}>{L.lead}</p>
            <div className={s.actions}>
              <AuthTrigger
                mode="register"
                niche={niche}
                className={`${s.cta} ${s.ctaBig}`}
              >
                {L.ctaPrimary(TRIAL_DAYS)}
              </AuthTrigger>
              <span className={s.note}>{L.ctaNote}</span>
            </div>
          </Reveal>

          {/* Единственный снимок, который человек видит до прокрутки, —
              значит единственный, который стоит грузить заранее. */}
          <RevealMedia onMount delay={0.12} className={s.heroShot}>
            <Image
              src="/landing/bright/hero.jpg"
              alt={L.heroAlt}
              fill
              preload
              sizes="100vw"
            />
          </RevealMedia>
        </section>

        {L.steps.slice(0, 2).map((step, i) => (
          <StepBlock key={step.title} step={step} index={i} />
        ))}

        {/* Полоса с машиной: вдох между шагами. Одна строка и кадр во всю
            ширину — читать тут нечего, только смотреть. */}
        <section className={`${s.band} ${s.lime}`}>
          <Reveal className={s.bandText}>
            <h2 className={s.h2}>{L.headlineAccent}</h2>
          </Reveal>
          <RevealMedia className={s.bandShot}>
            <Image
              src="/landing/bright/car.jpg"
              alt={L.priceAlt}
              fill
              sizes="100vw"
            />
          </RevealMedia>
        </section>

        {L.steps.slice(2).map((step, i) => (
          <StepBlock key={step.title} step={step} index={i + 2} />
        ))}

        <section className={`${s.price} ${s.blue}`} id="price">
          <Reveal>
            <p className={s.eyebrow}>{L.priceTitle}</p>
            <p className={s.priceSum}>{formatMoney(PRICE, 'AMD')}</p>
            <p className={s.pricePeriod}>{L.pricePeriod}</p>
            <p className={s.priceNote}>{L.priceNote(TRIAL_DAYS)}</p>
            <div className={s.priceActions}>
              <AuthTrigger
                mode="register"
                niche={niche}
                className={`${s.cta} ${s.ctaBig}`}
              >
                {L.ctaPrimary(TRIAL_DAYS)}
              </AuthTrigger>
              <span className={s.note}>{L.ctaNote}</span>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className={`${s.footer} ${s.blue}`}>
        <span>{L.footer}</span>
        <nav className={s.footerLinks}>
          <Link href="/privacy">{hy.legal.privacy}</Link>
          <Link href="/support">{hy.legal.support}</Link>
        </nav>
      </footer>
    </div>
  );
}

/** Шаг рабочего дня: слово слева, кадр с экраном продукта справа. */
function StepBlock({
  step,
  index,
}: {
  step: (typeof hy.landing.steps)[number];
  index: number;
}) {
  const media = STEPS[index];
  if (!media) return null;

  /* Стороны меняются местами через одну: четыре одинаковых разворота
     подряд читаются как один длинный. */
  const flip = index % 2 === 1;

  return (
    <section
      className={`${s.step} ${flip ? s.stepFlip : ''} ${
        media.tone === 'lime' ? s.lime : s.blue
      }`}
    >
      <Reveal className={s.stepText}>
        <p className={s.stepIndex}>{`0${index + 1}`}</p>
        <h2 className={s.h2}>{step.title}</h2>
        <p className={s.stepBody}>{step.body}</p>
      </Reveal>

      {/* Кадр отстаёт от слова на восьмую секунды: сначала понятно, о чём
          речь, потом показывают. */}
      <RevealMedia
        className={`${s.stepMedia} ${media.shape === 'square' ? s.mediaSquare : s.mediaTall}`}
        delay={0.12}
      >
        <figure className={`${s.stepPhoto} ${media.fade ? s.fadeOut : ''}`}>
          <Image
            src={media.photo}
            alt={step.alt}
            fill
            sizes="(max-width: 860px) 100vw, 46vw"
          />
        </figure>
        <figure className={s.stepScreen}>
          <Image
            src={media.screen}
            alt={step.caption}
            width={SCREEN_W}
            height={SCREEN_H}
            sizes="(max-width: 860px) 118px, 210px"
          />
        </figure>
      </RevealMedia>
    </section>
  );
}
