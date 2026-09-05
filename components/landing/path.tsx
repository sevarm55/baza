'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';

import { Grip } from './grip';
import { LIVE } from './live-demo';
import { Money } from './money';

/**
 * Маршрут одной записи. Тело второй секции.
 *
 * Секция утверждает: одна запись проходит весь путь сама. Утверждение
 * показывается предметом, а не макетом экрана. Предмет — сама запись:
 * широкая карточка, которая на глазах собирается из номера машины,
 * услуги, мойщика и способа оплаты, а под ней рельса из пяти станций,
 * по которой она едет.
 *
 * Собирается ПЕРВАЯ машина демо-смены (`live-demo.ts`), та же, с
 * которой в следующей секции открывается лента владельца. Совпадение
 * намеренное: сначала её записали, потом её увидели. Никто этого не
 * заметит, но всё сойдётся у того, кто посмотрит.
 *
 * Такт живёт здесь и один на всё: карточка, рельса и подсветка станции
 * обязаны меняться в один кадр, а не по трём независимым таймерам.
 * Часы идут, только пока секция в кадре, — витрина не должна крутить
 * анимацию в фоне на всю длину страницы.
 *
 * При «уменьшении движения» такта нет: карточка собрана, рельса залита,
 * станции пройдены. Это конечное состояние маршрута, и оно же
 * единственное, которое имеет смысл показывать без анимации.
 */

/** Сколько держится каждая станция. Первая дольше: там набирается номер. */
const HOLD = [2000, 1250, 1250, 1250, 2400];

const STEPS = HOLD.length;

const LAST = STEPS - 1;

const SPRING = { type: 'spring' as const, stiffness: 120, damping: 20 };

/** Записываемая машина. Первая в смене — та же, что откроет ленту ниже. */
const R = LIVE[0];

type Step = { title: string; body: string };

/**
 * Номер, набираемый по знаку.
 *
 * Отдельным узлом, чтобы счётчик знаков сбрасывался сменой ключа, а не
 * присвоением из эффекта: сброс состояния ключом — то, для чего ключ и
 * существует, а синхронный setState в эффекте запускает каскад
 * отрисовок. Пока номер набирается, за ним стоит курсор.
 */
function Typing({ text, on }: { text: string; on: boolean }) {
  const [n, setN] = useState(on ? 0 : text.length);

  useEffect(() => {
    if (!on) return;
    /* Девять знаков по 150 мс укладываются в первую станцию с запасом:
       добор не наезжает на выбор услуги. */
    const id = window.setInterval(() => {
      setN((v) => (v >= text.length ? v : v + 1));
    }, 150);
    return () => window.clearInterval(id);
  }, [on, text.length]);

  return (
    <>
      {text.slice(0, n)}
      {on ? (
        <motion.span
          aria-hidden
          className="ml-1 inline-block h-[0.72em] w-[3px] translate-y-[-0.02em] bg-[#c0390f] dark:bg-[#ff6a2a]"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      ) : null}
    </>
  );
}

/** Приставшее к записи свойство: услуга, мойщик, оплата. */
function Chip({ children, still }: { children: string; still: boolean }) {
  return (
    <motion.span
      initial={
        still ? false : { opacity: 0, y: 12, filter: 'blur(8px)', scale: 0.94 }
      }
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
      transition={SPRING}
      className="inline-flex items-center rounded-full border border-border bg-[var(--landing-bg)] px-4 py-2 text-[13px] font-medium whitespace-nowrap md:text-sm"
    >
      {children}
    </motion.span>
  );
}

export function Path({
  steps,
  locale,
  labels,
}: {
  steps: readonly Step[];
  locale: string;
  labels: {
    /** Что выбрано: услуга из прайса демо-мойки, способ оплаты из продукта. */
    service: string;
    payment: string;
    /** «Записано» — ответ продукта, когда запись ушла в отчёт. */
    saved: string;
  };
}) {
  const still = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const watching = useInView(wrap, { margin: '-20% 0px -20% 0px' });
  const [step, setStep] = useState(still ? LAST : 0);

  /* Возврат в кадр к уже собранной записи начинает её заново: иначе
     человек видит готовую карточку и не понимает, что она собиралась.
     Прерванную на середине не трогаем — она просто продолжается.
     Нулевым таймером, а не вызовом в теле эффекта: синхронный setState
     там запускает каскад отрисовок. */
  useEffect(() => {
    if (still || !watching) return;
    const id = window.setTimeout(() => setStep((s) => (s >= LAST ? 0 : s)), 0);
    return () => window.clearTimeout(id);
  }, [still, watching]);

  useEffect(() => {
    if (still || !watching) return;
    const id = window.setTimeout(
      () => setStep((s) => (s + 1) % STEPS),
      HOLD[step],
    );
    return () => window.clearTimeout(id);
  }, [step, still, watching]);

  const done = step >= LAST;
  /* Цена известна с выбором услуги: до неё платить не за что. */
  const price = step >= 1 ? R.price : 0;
  /* Доля пройденного пути. Пятая станция — единица, то есть рельса
     залита целиком ровно тогда, когда запись ушла в отчёт. */
  const passed = (step + 1) / STEPS;

  return (
    <div ref={wrap} /* Отступ сверху одинаковый на всех ширинах: на телефоне за
         верхний край карточки держится робот, и его голова заходит в
         поле подписи. Букв она не задевает — последняя строка там
         короткая, — но запас нужен на случай другого языка. */
      className="mt-16">
      {/* Сама запись. Во всю ширину, а не карточкой в углу: это главный
          предмет секции, и он обязан занимать столько же места, сколько
          занимает заголовок. На последней станции карточка теплеет —
          запись ушла в отчёт, и это единственное, что об этом
          говорит.

          Обёртка нужна роботу: он держится за верхнюю границу карточки, а
          «выше границы» считается от того узла, в котором он лежит. */}
      <div className="relative">
      <motion.div
        animate={
          still
            ? undefined
            : {
                borderColor: done ? 'rgba(192,57,15,0.45)' : 'var(--border)',
              }
        }
        transition={{ duration: 0.5 }}
        /* Не контур, а поверхность. Запись — главный предмет секции, и
           тонкой рамки ей мало: панель приподнята над листом своим
           фоном, волосяной гранью сверху и мягкой тенью под собой.
           Карточки на витрине больше нигде нет — она здесь ровно
           потому, что подъём означает старшинство. */
        className="relative overflow-hidden rounded-[1.6rem] border border-border bg-[#ffffff]/55 px-6 py-8 shadow-[0_24px_60px_-40px_rgba(26,18,14,0.55),inset_0_1px_0_rgba(255,255,255,0.6)] md:rounded-[2rem] md:px-10 md:py-11 dark:bg-white/[0.035] dark:shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)]"
      >
        {/* Тёплая подложка приходит вместе с итогом. Отдельным слоем, а
            не сменой фона: цвет обязан наплывать, а не переключаться. */}
        <motion.span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[#c0390f]/[0.05] dark:bg-[#ff6a2a]/[0.07]"
          initial={false}
          animate={{ opacity: done ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        />

        <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between md:gap-10">
          <div className="min-w-0">
            {/* Номер набран тем же начертанием, что и заголовки витрины:
                на мойке запись начинается с него, и на карточке он тоже
                первый по величине. */}
            <p className="font-wordmark text-[30px] leading-none tracking-[-0.02em] md:text-[42px]">
              <Typing
                key={step === 0 && !still ? 'typing' : 'typed'}
                text={R.plate}
                on={step === 0 && !still}
              />
            </p>

            {/* Свойства пристают к записи по одному, каждое на своей
                станции. Высота ряда закреплена: без этого карточка
                подрастала бы на каждом шаге и дёргала всё под собой. */}
            <div className="mt-6 flex min-h-[38px] flex-wrap items-center gap-2">
              <AnimatePresence>
                {/* Ключи обязательны: без них `AnimatePresence` считает
                    трёх соседей одним и тем же узлом. */}
                {step >= 1 ? (
                  <Chip key="service" still={still ?? false}>
                    {labels.service}
                  </Chip>
                ) : null}
                {step >= 2 ? (
                  <Chip key="washer" still={still ?? false}>
                    {R.washer}
                  </Chip>
                ) : null}
                {step >= 3 ? (
                  <Chip key="payment" still={still ?? false}>
                    {labels.payment}
                  </Chip>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* Сумма. Считается пружиной и на последней станции получает
              отметку: запись стала строкой отчёта. */}
          <div className="shrink-0">
            {/* Подпись стоит НАД строкой, а отметка внутри неё: если
                сложить их в один ряд, отметка встаёт по центру всего
                блока вместе с подписью и оказывается выше цифр. */}
            <div className="h-[16px] text-right">
              <AnimatePresence>
                {done ? (
                  <motion.p
                    key="saved"
                    initial={still ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-2xs font-medium tracking-wider text-[#c0390f] uppercase dark:text-[#ff6a2a]"
                  >
                    {labels.saved}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="mt-1 flex items-center justify-end gap-3 md:gap-4">
              <AnimatePresence>
                {done ? (
                  <motion.span
                    key="mark"
                    aria-hidden
                    initial={still ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={SPRING}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--lime)] text-[var(--lime-foreground)] md:size-9"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4.5 10.5l3.6 3.6L15.5 6.5" />
                    </svg>
                  </motion.span>
                ) : null}
              </AnimatePresence>

              <Money
                value={price}
                locale={locale}
                className="num font-wordmark block text-[28px] leading-none tracking-[-0.02em] md:text-[40px]"
              />
            </div>
          </div>
        </div>
      </motion.div>

        {/* Стоит ПОСЛЕ карточки: так пальцы ложатся поверх её границы без
            единого z-index. */}
        <Grip src="/hero/grip.webp" active={Boolean(watching)} />
      </div>

      {/* Рельса. Пять станций во всю ширину: путь непрерывный, и линия —
          само это утверждение, а не украшение под ним. На узком экране
          она встаёт вертикально, слева от подписей, и утверждение
          сохраняется. */}
      <ol className="relative mt-12 grid gap-8 md:mt-14 md:grid-cols-5 md:gap-6">
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-[13.5px] w-px bg-border md:top-[13.5px] md:right-0 md:bottom-auto md:left-0 md:h-px md:w-auto"
        />
        {/* Пройденная часть пути. Растёт вместе с записью. Узла два, а
            не один с адаптивными классами: движение задаётся встроенным
            стилем, а он сильнее любого правила по ширине экрана, и одна
            линия не смогла бы тянуться вниз на телефоне и вправо на
            широком экране. */}
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-[13.5px] w-px origin-top bg-[#c0390f] md:hidden dark:bg-[#ff6a2a] dark:shadow-[0_0_10px_rgba(255,106,42,0.45)]"
          initial={false}
          animate={{ scaleY: passed }}
          transition={SPRING}
        />
        <motion.span
          aria-hidden
          className="absolute top-[13.5px] right-0 left-0 hidden h-px origin-left bg-[#c0390f] md:block dark:bg-[#ff6a2a] dark:shadow-[0_0_10px_rgba(255,106,42,0.45)]"
          initial={false}
          animate={{ scaleX: passed }}
          transition={SPRING}
        />

        {steps.map((s, i) => {
          const passed = step >= i;
          return (
            <li
              key={s.title}
              className="relative flex gap-4 md:flex-col md:gap-0"
            >
              <span className="relative z-10 flex size-7 shrink-0 items-center justify-center">
                <motion.span
                  aria-hidden
                  className={`absolute inset-0 rounded-full border bg-[var(--landing-bg)] transition-colors duration-500 ${
                    passed
                      ? 'border-[#c0390f] dark:border-[#ff6a2a]'
                      : 'border-border'
                  }`}
                  animate={still ? undefined : { scale: step === i ? 1.16 : 1 }}
                  transition={SPRING}
                />
                <span
                  className={`font-wordmark relative text-[10px] leading-none transition-colors duration-500 ${
                    passed
                      ? 'text-[#c0390f] dark:text-[#ff6a2a]'
                      : 'text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </span>
              </span>

              <div className="md:mt-5">
                <h3
                  className={`text-[15px] leading-snug font-semibold transition-colors duration-500 md:text-base ${
                    step === i ? 'text-foreground' : 'text-foreground/50'
                  }`}
                >
                  {s.title}
                </h3>
                <p
                  className={`mt-1 text-[13px] leading-relaxed transition-colors duration-500 md:mt-1.5 md:text-sm ${
                    step === i
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {s.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
