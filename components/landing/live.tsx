'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';

import { formatMoney } from '@/lib/money';
import { LIVE, LIVE_INTERVAL, LIVE_WINDOW, totals } from './live-demo';
import { Money } from './money';
import { Words } from './words';

/**
 * Живая смена. Правая половина третьей секции.
 *
 * Секция утверждает, что владелец видит деньги в тот же момент, когда
 * мойщик записывает машину. Утверждение показывается, а не пересказывается:
 * машины приходят одна за другой, и суммы слева растут ровно на них.
 *
 * Числа сходятся по-настоящему (`live-demo.ts`): выручка это сумма
 * показанных машин, зарплата это проценты мойщиков от их собственных
 * машин, «вы» это разница. Посетитель, который сложит колонку в уме,
 * получит то же, что видит. Поэтому лента и подписана «демо», а не
 * выдаёт себя за чужую боевую мойку.
 *
 * Компонент клиентский, крошечный и мемоизированный: постоянное движение
 * обязано жить в своём листе и не дёргать перерисовкой ничего вокруг.
 * Суммы меняются вне цикла отрисовки React — пружина пишет прямо в
 * `textContent`, поэтому счёт до тысяч не стоит ни одного рендера.
 *
 * При «уменьшении движения» ленты нет: показывается вся смена целиком и
 * её итог, без единого кадра анимации и без таймера.
 */

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 20 };

type Copy = { title: string; lead: string };

type Labels = {
  demo: string;
  revenue: string;
  payroll: string;
  you: string;
  /** Словарь отдаёт кортеж только для чтения — тут он только читается. */
  services: readonly string[];
};

function LiveShift({
  locale,
  copy,
  labels,
}: {
  locale: string;
  copy: Copy;
  labels: Labels;
}) {
  const still = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  /* Смена идёт, только пока секция в кадре. Раньше таймер запускался
     вместе со страницей, и человек, доскроллив сюда через полминуты,
     попадал на такт сброса: пустое окно и три нуля. Он не видел ни
     одной машины и уходил дальше, а секция ровно про то, как машины
     приходят. */
  const watching = useInView(wrap, { margin: '-15% 0px -15% 0px' });
  /* Сколько машин уже приехало. Ноль это «смена только началась». */
  const [count, setCount] = useState(still ? LIVE.length : 0);

  useEffect(() => {
    if (still || !watching) return;
    /* Первая машина показывается сразу, а не через такт: пустое окно в
       начале выглядит поломкой, а не ожиданием. Нулевым таймером, а не
       вызовом в теле эффекта: синхронный setState там запускает каскад
       отрисовок. Смена, застигнутая на середине, продолжается с места —
       заново начинается только не начатая и уже закрытая. */
    const first = window.setTimeout(() => {
      setCount((n) => (n === 0 || n >= LIVE.length ? 1 : n));
    }, 0);
    const id = window.setInterval(() => {
      /* После последней машины смена начинается заново: лента обязана
         крутиться, а суммы обязаны сходиться, и оба условия выполняются
         только со сбросом. Сброс идёт к первой машине, а не к нулю —
         лента не обязана пустеть ни на кадр. */
      /* На полной смене задерживаемся на один такт: сброс должен
         читаться закрытой сменой, а не обрывом ленты. */
      setCount((n) => (n > LIVE.length ? 1 : n + 1));
    }, LIVE_INTERVAL);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [still, watching]);

  /* На такте паузы `count` уходит за длину смены: итоги и лента при
     этом обязаны показывать полную смену, а не выйти за массив. */
  const done = Math.min(count, LIVE.length);
  const sum = totals(done);
  const shown = LIVE.slice(Math.max(0, done - LIVE_WINDOW), done).reverse();

  return (
    /* Раскладка асимметричная: слово и суммы слева, лента справа. Доли
       неравные нарочно — обещание уже прозвучало наверху, здесь очередь
       показа, и места ему отдано больше. */
    <div ref={wrap} className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
      <div>
        <Words
          id="live-title"
          text={copy.title}
          className="font-wordmark max-w-[14ch] text-[26px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[36px]"
        />
        <p className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground md:mt-6 md:text-base">
          {copy.lead}
        </p>

        {/* Итоги. Не карточки: три строки, разделённые волосяной линией.
            Цифре подложка не нужна, ей нужна тишина вокруг. */}
        <dl className="mt-10 divide-y divide-border border-y border-border md:mt-12">
          {[
            { k: labels.revenue, v: sum.revenue, strong: false },
            { k: labels.payroll, v: sum.payroll, strong: false },
            { k: labels.you, v: sum.you, strong: true },
          ].map((row) => (
            <div key={row.k} className="flex items-baseline justify-between gap-6 py-5">
              <dt className="text-[13px] text-muted-foreground md:text-sm">{row.k}</dt>
              <dd
                className={
                  row.strong
                    ? 'num text-[22px] leading-none font-semibold tracking-[-0.02em] md:text-[28px]'
                    : 'num text-[17px] leading-none tracking-[-0.01em] text-muted-foreground md:text-xl'
                }
              >
                <Money value={row.v} locale={locale} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Лента машин. */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <motion.span
            aria-hidden
            className="size-1.5 rounded-full bg-[#c0390f] dark:bg-[#ff6a2a]"
            animate={still ? undefined : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">
            {labels.demo}
          </span>
        </div>

        {/* Высота окна прибита, а не задана минимумом, и содержимое
            обрезается. Причина: пока уходящая строка доигрывает, в списке
            на мгновение пять строк вместо четырёх, и контейнер с
            `min-height` успевал подрасти — под лентой всё дёргалось.
            С прибитой высотой лишняя строка просто уезжает за край, и
            снаружи не двигается ничего. Высота считается из строк:
            4 × 52 точки. */}
        <ul className="h-[208px] overflow-hidden border-t border-border">
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.li
                key={`${r.plate}-${r.washer}`}
                layout
                initial={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={SPRING}
                className="flex h-[52px] items-center justify-between gap-4 border-b border-border"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="num shrink-0 text-[13px] font-semibold tracking-wide md:text-sm">
                    {r.plate}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {labels.services[r.service]} · {r.washer}
                  </span>
                </span>
                <span className="num shrink-0 text-[13px] tracking-[-0.01em] md:text-sm">
                  {formatMoney(r.price, 'AMD', locale)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

export const Live = memo(LiveShift);
