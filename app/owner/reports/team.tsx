import { LinkRow } from '@/components/patterns/detail-list';
import { Panel } from '@/components/patterns/panel';
import { PersonAvatar } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';

export type TeamMember = {
  key: string;
  name: string;
  count: number;
  /** уже деньгами */
  earned: string;
};

/**
 * Кто сделал этот месяц.
 *
 * Не копия страницы сотрудников: здесь нет ни ставок, ни телефонов, ни
 * управления, только вклад в тот месяц, который открыт. Отчёт отвечает
 * «из чего сложился результат», и люди в нём такая же составляющая, как
 * услуги и расходы.
 *
 * Строка внизу ведёт на зарплаты, а не в карточку человека: из отчёта
 * за месяц следующий вопрос про людей всегда один, сколько им осталось
 * отдать.
 */
export async function ReportTeam({
  rows,
  unitOne,
  title,
  className,
}: {
  rows: TeamMember[];
  unitOne: string;
  title: string;
  className?: string;
}) {
  const t = await getDict();
  return (
    <Panel
      title={title}
      count={rows.length > 0 ? rows.length : undefined}
      padded={false}
      className={className}
      bodyClassName="flex flex-col"
    >
      {rows.length === 0 ? (
        <EmptyState compact title={t.reports.emptyMonth} />
      ) : (
        /* Ссылка на зарплаты прижата к низу: в ряду с соседними панелями
           высота общая, и список не обязан её заполнять. */
        <div className="flex flex-1 flex-col">
          <ul className="flex-1 divide-y divide-border">
            {rows.map((p) => (
              <li key={p.key} className="flex items-center gap-3 px-4 py-2.5">
                <PersonAvatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {unitCount(p.count, unitOne, t.locale)}
                  </span>
                </span>
                <span className="num shrink-0 text-sm font-semibold">{p.earned}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border">
            <LinkRow href="/owner/payroll" title={t.reports.toPayroll} />
          </div>
        </div>
      )}
    </Panel>
  );
}
