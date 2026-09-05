'use client';

import { Fragment } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Заголовок, который собирается из слов.
 *
 * Каждое слово выходит из размытия со своей задержкой. Заголовков на
 * витрине четыре, и до этого они просто лежали в разметке: секция
 * начиналась молча, а всё движение было ниже. Слово за словом — это
 * ритм чтения, а не украшение: глаз идёт по строке в том же порядке.
 *
 * Разделитель между словами — обычный пробел отдельным узлом, а не
 * неразрывный внутри слова. Иначе заголовок перестал бы переноситься,
 * а он у всех секций ограничен по числу знаков и обязан ломаться.
 *
 * `data-reveal` нужен для случая без скрипта: правило в `<noscript>`
 * возвращает словам непрозрачность, иначе заголовка не будет вовсе.
 */
export function Words({
  text,
  id,
  className,
  as = 'h2',
}: {
  text: string;
  id?: string;
  className?: string;
  /** Уровень заголовка. Разметка обязана следовать смыслу, а не размеру. */
  as?: 'h2' | 'h3';
}) {
  const still = useReducedMotion();
  const Tag = as;
  const words = text.split(' ');

  if (still) {
    return (
      <Tag id={id} className={className}>
        {text}
      </Tag>
    );
  }

  const M = as === 'h2' ? motion.h2 : motion.h3;

  return (
    <M
      id={id}
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-12% 0px -12% 0px' }}
      transition={{ staggerChildren: 0.07 }}
    >
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <motion.span
            data-reveal
            className="inline-block"
            variants={{
              hidden: { opacity: 0, y: '0.32em', filter: 'blur(12px)' },
              shown: { opacity: 1, y: 0, filter: 'blur(0px)' },
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </M>
  );
}
