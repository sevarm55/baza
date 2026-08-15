import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getServiceStats, getTenant, listServices, startOfMonth } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { Segmented } from '@/components/segmented';
import { Services, type ServiceRow } from './services';
import { BusinessForm } from './business-form';

type Tab = 'services' | 'business' | 'data';

/**
 * Настройки.
 *
 * Раздел называется «настройки», но настроек в привычном смысле здесь
 * почти нет: главное, что тут лежит, — прейскурант, а его правят чаще
 * всего остального в кабинете вместе взятого. Поэтому страница не список
 * переключателей, а три разных дела под одним именем:
 *
 *   услуги и цены   — что я продаю и почём;
 *   бизнес          — как называется точка и куда идти за остальным;
 *   данные          — забрать своё и уйти.
 *
 * Раньше они лежали в двух колонках вперемешку: слева прайс, справа
 * название бизнеса, ссылки, выгрузка и удаление бизнеса подряд. На
 * телефоне колонки складывались, и до цен приходилось листать мимо
 * кнопки, стирающей мойку целиком.
 *
 * Разделы живут в адресе, а не в состоянии: на «данные» можно послать
 * ссылку, а возврат из выгрузки открывает то место, откуда ушли.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; delete?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const asked = await searchParams;
  const tab: Tab = asked.s === 'business' || asked.s === 'data' ? asked.s : 'services';

  /* Маршрут удаления возвращает сюда с причиной отказа: показать её
     формой он не может — ответом уходит либо файл, либо редирект. */
  const failure = asked.delete;
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

  /* Открытый раздел приходит из адреса и попадает обратно в него же:
     ошибка удаления возвращается на «данные», а не на прайс. */
  const href = (key: Tab) => (key === 'services' ? '/owner/settings' : `/owner/settings?s=${key}`);

  return (
    <>
      <PageHead title={hy.owner.tabSettings} meta={hy.settings.lead}>
        <Segmented
          id="settings-tabs"
          current={tab}
          full
          label={hy.owner.tabSettings}
          items={[
            { key: 'services', label: hy.settings.tabServices, href: href('services') },
            { key: 'business', label: hy.settings.business, href: href('business') },
            { key: 'data', label: hy.settings.tabData, href: href('data') },
          ]}
        />
      </PageHead>

      {tab === 'services' && (
        <>
          {/* Операционная строка вместо четырёх карточек: сколько услуг в
              прейскуранте, по какой средней цене и что он принёс за
              месяц. Числа справочные, и весить как показания им незачем. */}
          <p className="quick">
            <b className="num">{services.length}</b> {hy.owner.colService.toLocaleLowerCase('hy')}
            {avgPrice > 0 && (
              <>
                <i />
                {hy.owner.avgShort} <b className="num">{money(avgPrice)}</b>
              </>
            )}
            {cars > 0 && (
              <>
                <i />
                <b className="num">{cars}</b> {tenant.unitOne}
                <i />
                <b className="num">{money(revenue)}</b>{' '}
                {hy.owner.periodMonth.toLocaleLowerCase('hy')}
              </>
            )}
          </p>

          <div className="mt-[var(--seam)]">
            <Services rows={rows} step={step} currencySymbol={symbol} />
          </div>
        </>
      )}

      {tab === 'business' && (
        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <Panel title={hy.settings.business} className="lg:col-span-7">
            {/* Подпись отдельной строкой, а не оберткой: внутри своя
                форма, а форму в `<label>` заворачивать нельзя — поле
                внутри неё перестаёт быть подписанным. */}
            <div className="grid gap-1.5">
              <span className="label">{hy.settings.businessName}</span>
              <BusinessForm name={tenant.name} />
            </div>

            {/* Точки и своя страница — не действия, а переходы, и живут
                они строками в том же приборе, что название. Раньше под
                каждый был отдельный прибор с одной широкой кнопкой. */}
            <div className="rows mt-4">
              <Link className="link-row" href="/owner/profile">
                {hy.profile.title}
              </Link>
              <Link className="link-row" href="/owner/points">
                {hy.points.title}
              </Link>
            </div>
          </Panel>

          <div className="lg:col-span-5">
            <DangerZone deleteError={deleteError} />
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <Panel title={hy.settings.export} className="lg:col-span-7">
            <p className="text-[14px]" style={{ color: 'var(--board-muted)' }}>
              {hy.settings.exportNote}
            </p>

            <div className="mt-4">
              <a className="btn-inline" href="/owner/export?days=30" download>
                {hy.settings.exportCsv}
              </a>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

/**
 * Удаление бизнеса.
 *
 * За раскрывающимся заголовком и в стороне от всего остального:
 * действие необратимое, и на глаза оно попадаться не должно — его ищут
 * осознанно. Раньше оно лежало прямо под ссылкой на выгрузку, в одной
 * колонке с названием точки.
 */
function DangerZone({ deleteError }: { deleteError: string | null }) {
  /* Подложка и поле — те же, что у прибора, а не `.card`: на странице,
     где всё остальное собрано из приборов, карточка с другим полем
     читается деталью из другого набора. */
  return (
    <details
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      open={deleteError !== null}
    >
      <summary className="cursor-pointer text-[14px] font-semibold">
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
