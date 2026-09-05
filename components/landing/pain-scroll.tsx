'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

/**
 * Что ломается без системы. Сцена липнет, боли листаются.
 *
 * Было иначе и было плохо: наклейки лежали криво и таскались мышью.
 * Две беды. Первая — `drag` на тач-экране перехватывает вертикальный
 * жест, то есть секция мешала листать страницу; на телефоне это не
 * «интерактив», это поломка. Вторая — наклоны разъезжали базовые линии
 * заголовков, и стена читалась не игрой, а кривой вёрсткой.
 *
 * Теперь так. На широком экране сцена стоит слева и не уезжает, пока
 * справа проходят четыре боли; сцена меняется на ту, что сейчас читают.
 * Никакого перехвата жестов: страницу листает браузер, мы только смотрим,
 * что оказалось в кадре.
 *
 * На узком сцена встаёт над своим текстом, и всё превращается в обычную
 * стопку. Липкой колонки там нет вовсе: на телефоне она съела бы пол-экрана
 * ради картинки, которую и так видно.
 *
 * Картинки все четыре смонтированы разом и только гасятся прозрачностью,
 * а не подставляются: подстановка заставила бы браузер каждый раз
 * раскодировать webp заново, и переключение дёргалось бы.
 */

export type Pain = { title: string; body: string };

const EASE = [0.16, 1, 0.3, 1] as const;

export function PainScroll({ items, art }: { items: readonly Pain[]; art: readonly (string | null)[] }) {
  const [active, setActive] = useState(0);
  /* Ссылка стабильная: иначе эффект в каждом блоке пересоздавался бы на
     каждой отрисовке родителя, то есть на каждой смене активной боли. */
  const enter = useCallback((i: number) => setActive(i), []);
  const still = useReducedMotion();

  return (
    <div className="mt-14 grid gap-10 md:mt-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-20">
      {/* Сцена. Только на широком экране. */}
      <div className="hidden lg:block">
        <div className="sticky top-[16vh] h-[62vh]">
          {art.map((src, i) =>
            src ? (
              <motion.img
                key={src}
                src={src}
                alt=""
                aria-hidden
                width={720}
                height={720}
                className="absolute inset-0 size-full object-contain"
                animate={
                  still
                    ? { opacity: i === active ? 1 : 0 }
                    : {
                        opacity: i === active ? 1 : 0,
                        filter: i === active ? 'blur(0px)' : 'blur(12px)',
                        scale: i === active ? 1 : 0.96,
                      }
                }
                transition={{ duration: still ? 0 : 0.55, ease: EASE }}
              />
            ) : null,
          )}
        </div>
      </div>

      <ol>
        {items.map((item, i) => (
          <Block
            key={item.title}
            index={i}
            item={item}
            src={art[i] ?? null}
            active={active === i}
            onEnter={enter}
          />
        ))}
      </ol>
    </div>
  );
}

function Block({
  index,
  item,
  src,
  active,
  onEnter,
}: {
  index: number;
  item: Pain;
  src: string | null;
  active: boolean;
  onEnter: (index: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const still = useReducedMotion();
  /* Полоса посреди экрана: боль считается прочитанной, когда попала в
     середину, а не когда показался её край. */
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });

  /* Строго в эффекте. Тот же вызов прямо в рендере менял бы состояние
     родителя во время его отрисовки, и React на это ругается по делу:
     порядок обновлений становится непредсказуемым. */
  useEffect(() => {
    if (inView) onEnter(index);
  }, [inView, onEnter, index]);

  return (
    <li
      ref={ref}
      className="border-b border-border py-12 last:border-0 lg:flex lg:min-h-[62vh] lg:flex-col lg:justify-center lg:border-0 lg:py-0"
    >
      {/* Сцена на узком экране — над своим текстом. */}
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          aria-hidden
          width={720}
          height={720}
          className="mb-6 h-auto w-[190px] sm:w-[230px] lg:hidden"
        />
      ) : null}

      <motion.div
        initial={still ? false : { opacity: 0, y: 20, filter: 'blur(8px)' }}
        whileInView={still ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <span className="font-wordmark text-[11px] leading-none text-[#c0390f] dark:text-[#ff6a2a]">
          {String(index + 1).padStart(2, '0')}
        </span>

        <h3 className="mt-4 text-[19px] leading-snug font-semibold md:text-[22px] lg:text-[26px]">
          {item.title}
        </h3>

        {/* На широком экране непрочитанные боли приглушены: читают одну,
            а не четыре разом. На узком гасить нечего — там всё по очереди. */}
        <p
          className={`mt-3 max-w-[42ch] text-[14px] leading-relaxed text-muted-foreground md:text-[15px] lg:transition-opacity lg:duration-500 ${
            active ? 'lg:opacity-100' : 'lg:opacity-45'
          }`}
        >
          {item.body}
        </p>
      </motion.div>
    </li>
  );
}
