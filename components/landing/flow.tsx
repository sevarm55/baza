import type { Dict } from '@/lib/i18n';

import { Path } from './path';
import { Words } from './words';

/**
 * Путь одной машины. Вторая секция витрины.
 *
 * Первый экран дал обещание, эта секция показывает механику: одна
 * запись проходит пять шагов и сама превращается в строку отчёта.
 * Не «возможности продукта», а маршрут — потому что владелец мойки
 * покупает не список функций, а исчезнувшую тетрадь.
 *
 * Маршрут не пересказывается словами, он проходит на глазах: запись
 * собирается сама, а рельса под ней отмечает пройденные станции
 * (`path.tsx`). Раньше здесь лежала неподвижная разметка, и секция
 * читалась оглавлением к продукту, а не продуктом.
 *
 * Слова на карточке взяты из словаря самого продукта, а не написаны
 * для витрины: услуга из прайса демо-мойки, способ оплаты и ответ
 * «записано» — строки приложения. Витрина не имеет права показывать
 * слова, которых человек не увидит после регистрации.
 */
export function Flow({ t }: { t: Dict }) {
  const l = t.landing.how;

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="scroll-mt-16 bg-[var(--landing-bg)]"
    >
      <div className="mx-auto w-full max-w-[1360px] px-5 py-20 md:px-10 md:py-28">
        <Words
          id="how-title"
          text={l.title}
          className="font-wordmark max-w-[16ch] text-[26px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[36px]"
        />

        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground md:mt-6 md:text-base">
          {l.lead}
        </p>

        <Path
          steps={l.steps}
          locale={t.locale}
          labels={{
            /* Первая услуга демо-смены: та же, с которой в следующей
               секции откроется лента владельца. */
            service: t.landing.live.services[0],
            payment: t.payment.cash,
            saved: t.work.saved,
          }}
        />
      </div>
    </section>
  );
}
