import type { Dict } from '@/lib/i18n';

import { Live } from './live';

/**
 * Владелец видит прямо сейчас. Третья секция витрины.
 *
 * Вторая секция сказала, что запись проходит путь сама. Эта показывает,
 * во что путь превращается: пока мойщик записывает машины, суммы у
 * владельца растут ровно на них.
 *
 * Обёртка серверная и держит только оболочку секции. Заголовок с
 * подписью уезжают внутрь клиентского листа строками, а не разметкой:
 * там они стоят в одной сетке с суммами, а разметка у сетки одна.
 * На выдачу это не влияет — клиентский компонент точно так же
 * отрисовывается на сервере, и текст лежит в HTML.
 */
export function Proof({ t }: { t: Dict }) {
  const l = t.landing.live;

  return (
    <section
      id="live"
      aria-labelledby="live-title"
      className="scroll-mt-16 bg-[var(--landing-bg)]"
    >
      <div className="mx-auto w-full max-w-[1360px] px-5 py-20 md:px-10 md:py-28">
        <Live
          locale={t.locale}
          copy={{ title: l.title, lead: l.lead }}
          labels={{
            demo: l.demo,
            revenue: l.revenue,
            payroll: l.payroll,
            you: t.common.you,
            services: l.services,
          }}
        />
      </div>
    </section>
  );
}
