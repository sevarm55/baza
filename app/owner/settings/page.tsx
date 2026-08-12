import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getServiceStats, getTenant, listServices, startOfMonth } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { ServicesTable, type ServiceRow } from '@/components/services-table';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { IconCar, IconIncome, IconTag } from '@/components/flow-icons';
import { PageHead } from '@/components/page-head';
import { AddServiceForm } from './add-service-form';
import { BusinessForm } from './business-form';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  /* Маршрут удаления возвращает сюда с причиной отказа: показать её
     формой он не может — ответом уходит либо файл, либо редирект. */
  const failure = (await searchParams).delete;
  const deleteError =
    failure === 'pin'
      ? hy.settings.deleteWrongPin
      : failure === 'throttled'
        ? hy.settings.deleteThrottled
        : failure
          ? hy.settings.deleteFailed
          : null;

  /* Рядом с прейскурантом — что из него берут за месяц: цену правят
     оглядываясь на спрос, а не на сам список. */
  const [services, month] = await Promise.all([
    listServices(tenant.id),
    getServiceStats(tenant.id, startOfMonth(tenant.timezone)),
  ]);
  const symbol = currencySymbol(tenant.currency);
  const step = toMajor(1, tenant.currency);
  const money = (n: number) => formatMoney(n, tenant.currency);
  const sold = new Map(month.map((m) => [m.serviceId ?? '', m]));

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    price: toMajor(s.price, tenant.currency),
    display: formatAmount(s.price, tenant.currency),
    count: sold.get(s.id)?.count ?? 0,
    revenue: money(sold.get(s.id)?.revenue ?? 0),
  }));

  const cars = month.reduce((sum, m) => sum + m.count, 0);
  const revenue = month.reduce((sum, m) => sum + m.revenue, 0);
  const avgPrice = services.length
    ? Math.round(services.reduce((sum, s) => sum + s.price, 0) / services.length)
    : 0;

  /* Слева то, что правят каждую неделю, — цены. Справа то, что трогают
     раз в год: название, точки, выгрузка и удаление. На телефоне всё это
     шло одной колонкой, и до цен приходилось листать мимо кнопки
     удаления бизнеса. */
  return (
    <>
      <PageHead title={hy.owner.tabSettings} meta={hy.settings.priceNote} />

      {/* Полоса той же формы, что на остальных экранах: сколько услуг в
          прейскуранте, средняя цена и что он принёс за месяц. */}
      <FlowStrip
        links={[
          { label: hy.owner.colService, value: String(services.length), icon: IconTag, tone: 'violet' },
          {
            label: hy.settings.price,
            value: money(avgPrice),
            note: hy.owner.avgShort,
            icon: IconTag,
            tone: 'violet',
          },
          {
            label: tenant.unitOne,
            value: String(cars),
            note: hy.owner.periodMonth.toLowerCase(),
            icon: IconCar,
            tone: 'teal',
          },
          {
            label: hy.owner.revenue,
            value: money(revenue),
            note: hy.owner.periodMonth.toLowerCase(),
            strong: true,
            icon: IconIncome,
            tone: 'lime',
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-8">
          <Panel title={hy.settings.services} count={services.length}>
            <ServicesTable rows={rows} step={step} currencySymbol={symbol} />
          </Panel>

          <Panel title={hy.settings.newService}>
            <AddServiceForm currencySymbol={symbol} />
          </Panel>
        </div>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Panel title={hy.settings.business}>
            <BusinessForm name={tenant.name} />

            {/* Точки и выгрузка — не действия, а переходы, и живут они
                строками в том же приборе, что название. Раньше под
                каждый был отдельный прибор с одной широкой кнопкой:
                три заголовка и три кнопки ради двух ссылок. */}
            <div className="rows mt-3.5">
              <a className="link-row" href="/owner/profile">
                {hy.profile.title}
              </a>
              <a className="link-row" href="/owner/points">
                {hy.points.title}
              </a>
              <a className="link-row" href="/owner/export?days=30" download>
                {hy.settings.exportCsv}
              </a>
            </div>
          </Panel>

          <DangerZone deleteError={deleteError} />
        </div>
      </div>
    </>
  );
}

/**
 * Удаление бизнеса.
 *
 * Самым низом и за раскрывающимся заголовком: действие необратимое, и на
 * глаза оно попадаться не должно — его ищут осознанно.
 */
function DangerZone({ deleteError }: { deleteError: string | null }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">
        {hy.settings.deleteTitle}
      </summary>

      <p className="note mt-3">{hy.settings.deleteWhat}</p>
      <p className="note note-warn mt-1.5 font-semibold">{hy.settings.deleteNoWayBack}</p>

      <form method="post" action="/owner/settings/delete" className="mt-3.5 grid gap-2.5">
        <label className="grid gap-1.5">
          <span className="label">{hy.settings.deletePin}</span>
          <input
            className="field"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            required
          />
        </label>

        {deleteError && <p className="alert">{deleteError}</p>}

        {/* Сохраняющий путь первым: по умолчанию человек уносит свои
            данные с собой, а не теряет их молча. */}
        <button className="btn" name="mode" value="keep">
          {hy.settings.deleteKeep}
        </button>
        <button className="btn btn-ghost text-bad" name="mode" value="wipe">
          {hy.settings.deleteWipe}
        </button>
      </form>

      <p className="note mt-2.5">{hy.settings.deleteHint}</p>
    </details>
  );
}
