import { redirect } from 'next/navigation';

import { getRememberedAccount, getSession } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/plan';
import { ACTIVE_NICHES, getNiche } from '@/lib/niches';
import { AuthPortal } from '@/components/auth-buttons';
import { HeroBackground } from '@/components/hero-background';
import { LanguagePicker } from '@/components/language-picker';
import { AppStore } from '@/components/landing/app';
import { Cabinet } from '@/components/landing/cabinet';
import { Cta } from '@/components/landing/cta';
import { Enter } from '@/components/landing/enter';
import { Hail } from '@/components/landing/hail';
import { Flow } from '@/components/landing/flow';
import { Grain } from '@/components/landing/grain';
import { Offer } from '@/components/landing/offer';
import { PainSection } from '@/components/landing/pain-section';
import { Proof } from '@/components/landing/proof';
import { Questions } from '@/components/landing/questions';
import { Reveal } from '@/components/landing/reveal';
import { Robot } from '@/components/landing/robot';
import { ThemeToggle } from '@/components/theme-toggle';
import { BRAND } from '@/lib/brand';
import { getDict } from '@/lib/i18n/server';

/**
 * Корень адреса. Пустой лист.
 *
 * Витрины здесь больше нет: разделы, кадры и демо-числа снесены целиком
 * вместе со своим словарём (`components/landing`, `t.landing`). Страница
 * осталась, потому что на неё завязан вход: `lib/auth.ts`, выход из
 * кабинета, `/login`, `/start/…` и возврат по истёкшей сессии — все ведут
 * на `/?auth=signIn`. Окно входа живёт ровно тут и открывается адресом;
 * без него web-продукт остался бы без двери.
 *
 * Первый экран: свет (`components/hero-background.tsx`), прозрачная
 * шапка, заголовок в левой половине и робот в правой
 * (`components/landing/robot.tsx`). Действия под заголовком ещё нет.
 *
 * Шапка идёт потоком, а не `absolute`: фон и без того вынут из потока,
 * а высота шапки нужна будущему содержимому как отступ сверху, и
 * считать её вторым числом в двух местах ни к чему.
 *
 * Цвета шапки заданы обеими темами явно, потому что кадр под ней
 * переворачивается целиком: тёмный по умолчанию, светлый после клика по
 * значку. Своего фона у секции нет — лист рисует сам `HeroBackground`,
 * иначе цвет остался бы прибитым к разметке и не переключился.
 */
/** Значок в шапке: светлый на кадре, тёмный на белом. Один на оба. */
const HEADER_ICON =
  'text-[#1a120e]/60 hover:bg-[#1a120e]/8 hover:text-[#1a120e] dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white';

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const t = await getDict();
  const session = await getSession();
  if (session) redirect(session.role === 'owner' ? '/owner' : '/work');
  const remembered = await getRememberedAccount();

  const { auth } = await searchParams;
  const opened = auth === 'signIn' || auth === 'register' ? auth : null;
  const niche = ACTIVE_NICHES[0] ?? getNiche('carwash');

  return (
    <>
      {/* Зерно на всю витрину, одним слоем поверх всего. Внутри секции
          оно оставляло бы шов на каждом стыке. */}
      <Grain />

      {/* Первый экран. Кадр со своим светом, поэтому он отдельной
          секцией и со своим фоном; всё, что ниже, живёт на листе
          продукта и слушается темы обычным образом. */}
      <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[var(--landing-bg)]">
        <HeroBackground />

        <header className="relative z-20 w-full">
          <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between px-5 md:h-20 md:px-10">
            {/* Unbounded Black: `font-wordmark` это его токен в системе
                (`--font-wordmark` → `app/fonts/Unbounded-Latin-Black.woff2`),
                и набирается им во всём продукте одно слово — имя марки.

                Разрядка мелкая, 0.06em. У знака в кабинете она втрое
                шире, но там марка стоит подписью в 13 пунктов, и разрядка
                не даёт ей слипнуться. Здесь она заголовок кадра: буквы
                обязаны держаться вместе одним блоком, иначе вместо знака
                выходит строка прописных. */}
            <Reveal delay={0.05} blur={9} y={10}>
              <span className="font-wordmark text-[19px] leading-none tracking-[0.06em] text-[#1a120e] select-none md:text-[23px] dark:text-white">
                {BRAND.toUpperCase()}
              </span>
            </Reveal>

            {/* Язык и тема — два значка одного веса. Оба выбираются ДО
                входа, потому что человек, попавший на витрину не на своём
                языке, дальше первого экрана не идёт.

                Дверь стоит последней, у самого края: у неё одной есть
                рамка, и в углу она читается действием, а не третьим
                значком. Вернувшемуся клиенту больше некуда нажать —
                кнопка внизу страницы зовёт регистрироваться. */}
            <Reveal delay={0.05} blur={9} y={10} className="flex items-center gap-1 md:gap-1.5">
              <LanguagePicker compact className={HEADER_ICON} />
              <ThemeToggle className={HEADER_ICON} />
              <Enter label={t.auth.signIn} />
            </Reveal>
          </div>
        </header>

        {/* Правая половина: мойщик. Один кадр в полном качестве вместо
            прежней раскадровки из видео — почему, написано в
            `components/landing/robot.tsx`. */}
        <Robot alt={t.landing.hero.title} />

        {/* Левая половина кадра. Колонка ограничена по ширине, а не
            поделена сеткой пополам: заголовок обязан ломаться там, где
            ему велено, а не там, где кончилась ячейка.

            Отступ снизу на телефоне равен высоте робота: там он стоит не
            сбоку, а под текстом, и место ему отводится, а не отбирается
            внахлёст. На планшете и шире робот уходит вправо, и отступ
            возвращается к обычному. */}
        <div className="relative z-10 flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[1360px] px-5 pt-6 pb-[40svh] md:px-10 md:pb-28">
            <div className="max-w-[min(100%,640px)] lg:max-w-[54%]">
              {/* Интерлиньяж 1.05, а не привычные для крупного заголовка 0.9.
                У Unbounded очень высокий em-box: при значении меньше единицы
                строки садятся друг на друга буквально, а не тесно.

                Кегль считан по армянскому, а не по русскому: Montserrat
                Armenian шире прежнего начертания, и «ՎԵՐԱՀՍԿՈՂՈՒԹՅԱՆ» в
                одно слово задаёт нижнюю границу. На 390 точках при 32
                пунктах строка выходила за поле на двадцать две точки —
                прокрутки не появлялось, потому что секция режет по краю,
                и заметить это можно было только замером. */}
              <Reveal delay={0.18} blur={18} y={22}>
                <h1 className="font-wordmark text-[28px] leading-[1.05] tracking-[-0.015em] text-[#1a120e] uppercase md:text-[44px] lg:text-[58px] dark:text-white">
                  {t.landing.hero.title}
                </h1>
              </Reveal>

              {/* Кнопка на первом экране. До этого её тут не было вовсе:
                  единственный призыв стоял внизу страницы, в десяти
                  тысячах точек от заголовка, и большинство до него просто
                  не доходило. */}
              <Reveal delay={0.42} blur={10} y={14} className="mt-8 md:mt-10">
                {/* Подпись над кнопкой, а не под ней и не сбоку. Она
                    снимает страх «сейчас попросят карту», и снимать его
                    нужно до нажатия, а не после. Так же она стоит у цены
                    и в прилипшей полосе на телефоне. */}
                <div className="flex flex-col items-start gap-3">
                  <span className="text-[14px] text-[#1a120e]/65 md:text-[15px] dark:text-white/60">
                    {t.landing.hero.note(TRIAL_DAYS)}
                  </span>
                  <Cta label={t.landing.hero.cta} />
                </div>
              </Reveal>
            </div>
          </div>
        </div>

        <AuthPortal initial={opened} niche={niche.key} remembered={remembered} trialDays={TRIAL_DAYS} />
      </section>

      <Flow t={t} />
      <Proof t={t} />
      <Cabinet t={t} />
      <PainSection t={t} />
      <AppStore t={t} />
      <Offer t={t} />
      <Questions t={t} />

      {/* Прилипший призыв на телефоне. Ставится последним: он `fixed`,
          и место в потоке ему не нужно. */}
      <Hail label={t.landing.hero.cta} note={t.landing.hero.note(TRIAL_DAYS)} />
    </>
  );
}
