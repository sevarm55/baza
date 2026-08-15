'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/board';
import { Segmented } from '@/components/segmented';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import type { Metric, TrendPoint } from './model';

/**
 * Ход бизнеса по месяцам.
 *
 * Отчёт до сих пор отвечал на «сколько» таблицей и молчал о том, ради
 * чего его открывают: лучше или хуже стало. Шесть чисел в столбце
 * сравнивать глазами можно, но это работа, которую продукт уже умеет
 * делать сам — разница в высоте видна раньше, чем прочитано первое
 * число.
 *
 * Одна величина за раз, а не четыре линии сразу. Выручка, зарплата,
 * расходы и итог в одних осях отличаются друг от друга в разы: линия
 * расходов ложится на ноль и перестаёт что-либо показывать, а глазу
 * приходится держать легенду. Переключатель отвечает на три разных
 * вопроса по очереди: сколько осталось, сколько пришло, сколько машин.
 *
 * Столбики, а не линия. Месяцы — величина дискретная: между июлем и
 * августом ничего нет, и линия между ними обещала бы плавный переход,
 * которого не существует. Тот же выбор, что у рельефа дня на сводке.
 *
 * Нажатие по столбику открывает месяц. Это и есть главный способ ходить
 * по отчёту: увидел провал — открыл и разобрался, из чего он сложился.
 */
export function Trend({
  points,
  currency,
  unitOne,
}: {
  /** от старого к новому: график читают слева направо, как время */
  points: TrendPoint[];
  currency: string;
  unitOne: string;
}) {
  const [metric, setMetric] = useState<Metric>('profit');

  const money = (n: number) => formatMoney(n, currency);
  const valueOf = (p: TrendPoint) =>
    metric === 'profit' ? p.profit : metric === 'revenue' ? p.revenue : p.count;
  const label = (n: number) => (metric === 'count' ? String(n) : money(n));

  const values = points.map(valueOf);
  /* Ноль всегда внутри шкалы: без него месяц с убытком рисовался бы
     столбиком вверх от собственного дна, и провал читался бы ростом. */
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const zero = (top / span) * 100;
  const empty = top === 0 && bottom === 0;

  return (
    <Panel
      title={hy.reports.trend}
      className="lg:col-span-8"
      actions={
        <Segmented
          id="report-metric"
          current={metric}
          onSelect={(key) => setMetric(key as Metric)}
          label={hy.reports.trend}
          items={[
            { key: 'profit', label: hy.owner.profit },
            { key: 'revenue', label: hy.owner.revenue },
            { key: 'count', label: unitOne },
          ]}
        />
      }
    >
      <div className="trend">
        {points.map((p, i) => {
          const v = valueOf(p);
          /* Ненулевая величина обязана быть видна: столбик в ноль
             пикселей читается как «данных нет», а данные есть. */
          const height = empty ? 0 : Math.max(v === 0 ? 0 : 2, (Math.abs(v) / span) * 100);
          const negative = v < 0;

          return (
            <Link
              key={p.key}
              href={p.href}
              className="trend-col"
              data-on={p.current ? '' : undefined}
              aria-current={p.current ? 'page' : undefined}
              aria-label={`${p.label} · ${label(v)}`}
            >
              <span className="trend-plot">
                <span
                  className="trend-bar"
                  data-down={negative ? '' : undefined}
                  style={{
                    // отсчёт от нулевой линии вверх или вниз от неё
                    top: negative ? `${zero}%` : `${zero - height}%`,
                    height: `${height}%`,
                    // столбики поднимаются друг за другом, слева направо
                    ['--i' as string]: i,
                  }}
                  aria-hidden
                />
              </span>
              <span className="trend-name">{p.label}</span>
              <span className="num trend-value">{label(v)}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
