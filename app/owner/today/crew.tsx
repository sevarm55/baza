import { Panel, Row } from '@/components/board';
import { formatMoney } from '@/lib/money';
import type { CrewMember } from './model';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';

/**
 * Кто сегодня работает.
 *
 * Список отвечает на три вопроса одной строкой: кто стоит на мойке
 * сейчас, сколько машин он сделал и сколько за них ему причитается.
 * Сумма здесь — заработок человека, а не выручка, которую он принёс:
 * выручку уже назвала плита наверху, и повторять её именами значило бы
 * показать одни и те же деньги дважды под разными подписями.
 *
 * Порядок не по алфавиту и не по деньгам, а по состоянию: сначала те,
 * кто на смене, потом те, кто сегодня уже отработал. Внутри каждой
 * группы — по заработку. Вопрос «кто сейчас на площадке» задают чаще,
 * чем «кто заработал больше», и ответ на него не должен уезжать вниз
 * из-за того, что человек пришёл к обеду.
 *
 * Точка слева — состояние, а не опознавательный знак: зелёная значит
 * «сейчас здесь». Цветом человека помечено имя — тот же цвет, что в
 * ленте, во дворе и на зарплатах.
 */
export async function TodayCrew({
  className,
  crew,
  currency,
  unitOne,
  /* Заголовок приходит снаружи: у сегодняшнего дня это «сегодня
     работают», у месяца — просто «сотрудники». Обещать «сегодня» над
     месячными числами нельзя. */
  title,
}: {
  className?: string;
  crew: CrewMember[];
  currency: string;
  unitOne: string;
  title: string;
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <Panel className={className} title={title} count={crew.length > 0 ? crew.length : undefined}>
      {crew.length === 0 ? (
        <p className="py-6 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {t.today.nobodyOnShift}
        </p>
      ) : (
        <div className="board-journal">
          {crew.map((s) => (
            <Row key={s.staffId ?? `noname-${s.name}`}>
              {/* Точка у отработавшего — просто след строки, и подписи
                  ей не нужно: имя, машины и деньги рядом говорят всё.
                  Подписан только тот, кто на смене: это состояние, а не
                  оформление, и читалка экрана обязана его назвать. */}
              <span
                className={`size-2 shrink-0 rounded-full ${s.present ? 'dot-live' : 'dot-idle'}`}
                aria-label={s.present ? t.owner.onShiftNow : undefined}
                aria-hidden={s.present ? undefined : true}
              />
              {/* Имя и под ним ход его смены: с какого часа стоит и
                  сколько машин успел.

                  Это и есть «ход смены» из показа. Отдельной лентой
                  событий он в кабинете быть не может: записи о машинах
                  уже перечислены сегодняшней работой ниже — со временем,
                  номером, услугой и ценой, то есть подробнее любой
                  ленты, — и второй хронологический список повторял бы её
                  беднее. Своего в ленте оставалось ровно одно: когда
                  человек вышел. Этому месту оно и принадлежит — рядом с
                  тем, о ком оно. */}
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[15px] font-semibold"
                  style={{ color: s.present ? 'var(--on-board)' : 'var(--board-muted)' }}
                  title={s.name}
                >
                  {s.name}
                </span>
                <span
                  className="num block truncate text-[12.5px]"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {s.since && `${t.today.since(s.since)} · `}
                  {unitCount(s.count, unitOne, t.locale)}
                </span>
              </span>
              <span
                className="num shrink-0 text-right text-[15px] font-semibold tabular-nums"
                style={{ color: 'var(--on-board)' }}
              >
                {money(s.earned)}
              </span>
            </Row>
          ))}
        </div>
      )}
    </Panel>
  );
}
