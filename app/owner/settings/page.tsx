import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices } from '@/lib/queries';
import { currencySymbol, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { ServiceRow } from '@/components/service-row';
import { Panel } from '@/components/board';
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

  const services = await listServices(tenant.id);
  const symbol = currencySymbol(tenant.currency);
  const step = toMajor(1, tenant.currency);

  /* Слева то, что правят каждую неделю, — цены. Справа то, что трогают
     раз в год: название, точки, выгрузка и удаление. На телефоне всё это
     шло одной колонкой, и до цен приходилось листать мимо кнопки
     удаления бизнеса. */
  return (
    <>
      <PageHead title={hy.owner.tabSettings} meta={hy.settings.priceNote} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-8">
          <Panel title={hy.settings.services} count={services.length}>
            {/* Список, а не стопка форм: границу между услугами держит
                волосяная линия, а не воздух в полтора сантиметра. */}
            <div className="rows">
              {services.map((s) => (
                <ServiceRow
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  price={toMajor(s.price, tenant.currency)}
                  step={step}
                  currencySymbol={symbol}
                />
              ))}
            </div>
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
