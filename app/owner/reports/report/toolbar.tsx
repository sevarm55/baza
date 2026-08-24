'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download } from 'lucide-react';

import { DateRangePicker } from '@/components/patterns/date-range-picker';
import { Segmented } from '@/components/patterns/segmented';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n/client';
import type { RangeKey } from '@/lib/report-range';
import { SCOPES, TABS, type ReportTab, type Scope } from '../model';

export type ReportQuery = {
  r: RangeKey;
  from: string | null;
  to: string | null;
  tab: ReportTab;
  scope: Scope;
  compare: boolean;
};

/** Адрес отчёта из состояния: всё живёт в строке запроса. */
export function reportHref(pathname: string, q: ReportQuery): string {
  const p = new URLSearchParams();
  if (q.r !== 'month') p.set('r', q.r);
  if (q.r === 'custom' && q.from && q.to) {
    p.set('from', q.from);
    p.set('to', q.to);
  }
  if (q.tab !== 'overview') p.set('tab', q.tab);
  if (q.scope !== 'current') p.set('scope', q.scope);
  if (!q.compare) p.set('cmp', '0');
  const s = p.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/**
 * Панель отчёта: период, свой отрезок, сравнение, филиал, вкладки.
 *
 * Всё живёт в адресе, поэтому ссылку на «неделя по филиалам без
 * сравнения» можно послать себе же. Вкладки тем же переключателем, что
 * и период: один вид на всё, что выбирают.
 */
export function ReportToolbar({
  query,
  multi,
  exportHref,
}: {
  query: ReportQuery;
  /** у владельца больше одного филиала */
  multi: boolean;
  exportHref: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const href = (patch: Partial<ReportQuery>) => reportHref(pathname, { ...query, ...patch });

  const ranges: RangeKey[] = ['today', 'week', 'month', 'prevmonth'];

  return (
    <div className="flex flex-col gap-3">
      {/* На телефоне управление отчётом разворачивается в столбик:
          период, даты, сравнение и выгрузка — четыре разных решения, и
          втиснутые в одну строку они превращаются в четыре цели по
          восемьдесят точек, по которым не попасть. */}
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        <Segmented
          label={t.reports.period}
          size="sm"
          current={query.r}
          items={ranges.map((r) => ({ key: r, label: t.reports.periods[r], href: href({ r }) }))}
        />
        <DateRangePicker
          from={query.from}
          to={query.to}
          active={query.r === 'custom'}
          onApply={(from, to) => router.push(href({ r: 'custom', from, to }))}
        />

        <div className="ml-auto flex flex-wrap items-center gap-3 max-md:ml-0 max-md:w-full max-md:justify-between">
          <Label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Switch
              size="sm"
              checked={query.compare}
              onCheckedChange={(on) => router.push(href({ compare: on }))}
              aria-label={t.reports.compare}
            />
            {t.reports.compareShort}
          </Label>

          {multi && (
            <NativeSelect
              size="sm"
              aria-label={t.reports.branch}
              value={query.scope}
              onChange={(e) => router.push(href({ scope: e.target.value as Scope }))}
            >
              {SCOPES.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {t.reports.scopes[s]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}

          <Button
            variant="outline"
            size="sm"
            className="max-md:w-full"
            render={<Link href={exportHref} prefetch={false} />}
          >
            <Download data-icon="inline-start" aria-hidden />
            {t.reports.exportCsv}
          </Button>
        </div>
      </div>

      <Segmented
        label={t.reports.title}
        current={query.tab}
        items={TABS.map((tab) => ({ key: tab, label: t.reports.tabs[tab], href: href({ tab }) }))}
      />
    </div>
  );
}
