import Link from 'next/link';
import { Panel, Row } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';

export type TeamMember = {
  key: string;
  name: string;
  color: string;
  count: number;
  /** уже деньгами */
  earned: string;
};

/**
 * Кто сделал этот месяц.
 *
 * Не копия страницы сотрудников: здесь нет ни ставок, ни телефонов, ни
 * управления — только вклад в тот месяц, который открыт. Отчёт отвечает
 * «из чего сложился результат», и люди в нём такая же составляющая, как
 * услуги и расходы.
 *
 * Строка ведёт на зарплаты, а не в карточку человека: из отчёта за месяц
 * следующий вопрос про людей всегда один — сколько им осталось отдать.
 */
export async function ReportTeam({
  rows,
  unitOne,
  staffRole,
  className,
}: {
  rows: TeamMember[];
  unitOne: string;
  staffRole: string;
  className?: string;
}) {
  const t = await getDict();
  return (
    <Panel
      title={staffRole}
      count={rows.length > 0 ? rows.length : undefined}
      className={className}
    >
      {rows.length === 0 ? (
        <EmptyState title={t.reports.emptyMonth} />
      ) : (
        <>
          <div className="board-journal">
            {rows.map((p) => (
              <Row key={p.key}>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold" title={p.name}>
                  {p.name}
                </span>
                <span className="num shrink-0 text-[13px]" style={{ color: 'var(--board-muted)' }}>
                  {unitCount(p.count, unitOne, t.locale)}
                </span>
                <span className="num shrink-0 text-end text-[14.5px] font-semibold tabular-nums">
                  {p.earned}
                </span>
              </Row>
            ))}
          </div>

          <Link className="link-row mt-3.5" href="/owner/payroll">
            {t.reports.toPayroll}
          </Link>
        </>
      )}
    </Panel>
  );
}
