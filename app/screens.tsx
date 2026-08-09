import { Grid, Panel, Reading, Row, Tile } from '@/components/board';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import s from './landing.module.css';

/**
 * Снимки продукта на лендинге.
 *
 * Собраны из тех же блоков, что и сам продукт — `components/board.tsx`, —
 * а не нарисованы отдельно. Это не экономия: нарисованный отдельно снимок
 * отстаёт от продукта на следующий же день, и лендинг начинает обещать
 * то, чего внутри уже нет. Ровно так и вышло: страница показывала светлые
 * карточки, когда приложение давно стало тёмным табло.
 *
 * Цифры выдуманные, но правдоподобные: две машины за смену, сорок
 * процентов мойщику. Круглые «100 000» читались бы витриной.
 */

const PERCENT = 40;
const STAFF = 'Աշոտ';

const RECORDS = [
  { plate: '12 AB 345', name: 'Կոմպլեքս', pay: hy.payment.cash, price: 5000 },
  { plate: '48 SO 902', name: 'Քիմմաքրում', pay: hy.payment.card, price: 12000 },
];

const TOTAL = RECORDS.reduce((sum, r) => sum + r.price, 0);
const CASH = RECORDS.filter((r) => r.pay === hy.payment.cash).reduce((sum, r) => sum + r.price, 0);
const EARNED = RECORDS.reduce((sum, r) => sum + staffShare(r.price, PERCENT), 0);

const money = (n: number) => formatMoney(n);

/** Экран мойщика: его смена и его деньги. */
export function WorkerScreen() {
  return (
    <figure className={s.screen}>
      <figcaption className={s.screenBar}>
        {hy.roles.staff} · {STAFF}
      </figcaption>

      <div className={s.screenBody}>
        <Reading caption={hy.work.shiftTitle} value={money(EARNED)} />

        <Grid>
          <Tile tone="lime" label="մեքենա" value={RECORDS.length} />
          <Tile tone="teal" label={hy.payment.cash} value={money(CASH)} />
        </Grid>

        <Panel title={hy.work.recent} count={RECORDS.length} bare className="mt-4">
          <div className="board-journal">
          {RECORDS.map((r) => (
            <Row key={r.plate}>
              <span className="min-w-0 flex-1">
                <span className="num block truncate text-[13.5px] font-semibold">{r.plate}</span>
                <span
                  className="block truncate text-[11.5px]"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {r.name} · {r.pay}
                </span>
              </span>
              <span className="num shrink-0 text-[13.5px] font-semibold">{money(r.price)}</span>
            </Row>
          ))}
          </div>
        </Panel>
      </div>
    </figure>
  );
}

/** Сводка владельца: выручка, из чего она сложилась и кто её сделал. */
export function OwnerScreen() {
  const payroll = EARNED;
  const profit = TOTAL - payroll;

  return (
    <figure className={s.screen}>
      <figcaption className={s.screenBar}>
        {hy.roles.owner} · {hy.owner.tabToday}
      </figcaption>

      <div className={s.screenBody}>
        <Reading
          caption={hy.owner.revenueToday}
          value={money(TOTAL)}
          compare={`+${money(4200)} ${hy.owner.vsPrev}`}
          tone="good"
        />

        <Grid>
          <Tile
            tone="violet"
            wide
            label={hy.owner.profit}
            value={money(profit)}
            note={`${Math.round((profit / TOTAL) * 100)}% ${hy.owner.kept}`}
          />
          <Tile tone="slate" label={hy.owner.avgCheck} value={money(TOTAL / RECORDS.length)} />
          <Tile tone="amber" label={hy.owner.payroll} value={money(payroll)} />
        </Grid>

        <Panel title={hy.owner.onShift} count={1} bare className="mt-4">
          <div className="board-journal">
          <Row>
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: 'var(--person-3)' }}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{STAFF}</span>
            <span className="num shrink-0 text-[11.5px]" style={{ color: 'var(--board-muted)' }}>
              {RECORDS.length} · {PERCENT}%
            </span>
            <span className="num shrink-0 text-[13.5px] font-semibold">{money(EARNED)}</span>
          </Row>
          </div>
        </Panel>
      </div>
    </figure>
  );
}
