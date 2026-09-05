import type { Dict } from '@/lib/i18n';
import { SUPPORT_PHONE, SUPPORT_PHONE_HUMAN } from '@/lib/brand';
import { formatMoney } from '@/lib/money';
import { PRICE, TRIAL_DAYS } from '@/lib/plan';

import { Cta } from './cta';
import { Peek } from './peek';
import { Reveal } from './reveal';
import { Words } from './words';

/**
 * Цена и приглашение. Пятая секция витрины и последняя.
 *
 * Две вещи в одной нарочно. Человек, дочитавший до сюда, задаёт один
 * вопрос — «сколько», — и сразу за ответом ему нужна кнопка. Разносить
 * их по разным экранам значит заставить его прокрутить ещё раз ради
 * действия, которое он уже готов сделать.
 *
 * Слева факт, справа приглашение. Тарифов не несколько и звёздочек нет:
 * одна цена, и всё, что в неё входит, перечислено списком без карточек.
 * Оговорки (пробный срок один раз, второй филиал отдельно) стоят тут же,
 * а не мелким шрифтом внизу: их всё равно узнают, и лучше сейчас.
 *
 * Робот выглядывает из-за края экрана именно здесь. В четвёртой секции
 * он был бы пятым по счёту, а тут его больше нет нигде, и он снова
 * работает. Справа, потому что под кнопкой пусто, а слева внизу стоят
 * оговорки.
 */
export function Offer({ t }: { t: Dict }) {
  const p = t.landing.price;
  const c = t.landing.closing;

  return (
    <section
      id="price"
      aria-labelledby="price-title"
      className="relative scroll-mt-16 bg-[var(--landing-bg)]"
    >
      <div className="mx-auto grid w-full max-w-[1360px] gap-14 px-5 pt-20 pb-32 md:px-10 md:pt-28 md:pb-40 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-24">
        {/* Факт. */}
        <div>
          <Words
            id="price-title"
            text={p.title}
            className="font-wordmark max-w-[14ch] text-[26px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[36px]"
          />

          <Reveal delay={0.05} blur={14} y={18} className="mt-8 md:mt-10">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num font-wordmark text-[38px] leading-none tracking-[-0.02em] md:text-[54px]">
                {formatMoney(PRICE, 'AMD', t.locale)}
              </span>
              <span className="text-[14px] text-muted-foreground md:text-[15px]">
                {p.per} · {p.point}
              </span>
            </div>
          </Reveal>

          {/* Что входит. Не карточки: строки, разделённые волосяной
              линией. Список короткий, и коробка ему не нужна. */}
          <ul className="mt-9 divide-y divide-border border-y border-border md:mt-11">
            {p.includes.map((line) => (
              <li key={line} className="py-3.5 text-[14px] leading-relaxed md:text-[15px]">
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-5 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
            {p.note}
          </p>
        </div>

        {/* Приглашение. */}
        <div className="lg:pt-[4.5rem]">
          <Words
            as="h3"
            text={c.title}
            className="font-wordmark max-w-[13ch] text-[24px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[32px]"
          />

          <p className="mt-5 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground md:text-base">
            {c.lead}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-11">
            <Cta label={t.landing.hero.cta} />
            <span className="text-[13px] text-muted-foreground md:text-sm">
              {c.note(TRIAL_DAYS)}
            </span>
          </div>

          {/* Вторая дверь, и не для сомневающихся, а для тех, кто вообще
              не заводит учётные записи, пока не поговорит с человеком.
              Хозяин мойки сначала звонит. Номер стоит именно здесь,
              рядом с ценой, потому что решение принимают на этой строке,
              а не в подвале. */}
          <div className="mt-7 border-t border-border pt-6 md:mt-9">
            <p className="text-[13px] text-muted-foreground">{c.callNote}</p>
            <a
              href={`tel:${SUPPORT_PHONE}`}
              className="num mt-1.5 inline-block text-[19px] tracking-[-0.01em] hover:underline md:text-[21px]"
            >
              {SUPPORT_PHONE_HUMAN}
            </a>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{c.callHours}</p>
          </div>
        </div>
      </div>

      <Peek src="/hero/peek.webp" side="right" />
    </section>
  );
}
