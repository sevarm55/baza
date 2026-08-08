import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices } from '@/lib/queries';
import { currencySymbol, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { saveBusiness } from '@/app/actions';
import { ServiceRow } from '@/components/service-row';
import { AddServiceForm } from './add-service-form';

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

  return (
    <>
      <h2 className="h-section !mt-0">{hy.settings.services}</h2>

      {/* Между услугами воздуха заметно больше, чем внутри строки:
          на телефоне строка переносится, и без этого не видно, где
          кончается одна услуга и начинается следующая. */}
      <div className="grid gap-4">
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

      <h2 className="h-section">{hy.settings.newService}</h2>
      <AddServiceForm currencySymbol={symbol} />

      <p className="note mt-3.5">{hy.settings.priceNote}</p>

      <h2 className="h-section">{hy.points.title}</h2>
      <a className="btn btn-ghost inline-block text-center no-underline" href="/owner/points">
        {hy.points.title}
      </a>

      <h2 className="h-section">{hy.settings.export}</h2>
      <a className="btn btn-ghost text-center no-underline" href="/owner/export?days=30" download>
        {hy.settings.exportCsv}
      </a>

      <h2 className="h-section">{hy.settings.business}</h2>
      <form action={saveBusiness} className="card grid gap-2.5">
        <label className="grid gap-1.5">
          <span className="label">{hy.settings.businessName}</span>
          <input className="field" name="name" defaultValue={tenant.name} required />
        </label>
        <button className="btn">{hy.settings.save}</button>
      </form>

      {/* Самым низом страницы и за раскрывающимся заголовком: действие
          необратимое, и на глаза оно попадаться не должно — его ищут
          осознанно. */}
      <h2 className="h-section">{hy.settings.deleteTitle}</h2>
      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">
          {hy.settings.deleteTitle}
        </summary>

        <p className="note mt-3">{hy.settings.deleteWhat}</p>
        <p className="note mt-1.5 font-semibold text-red-600">{hy.settings.deleteNoWayBack}</p>

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

          {deleteError && <p className="note font-semibold text-red-600">{deleteError}</p>}

          {/* Сохраняющий путь первым: по умолчанию человек уносит свои
              данные с собой, а не теряет их молча. */}
          <button className="btn" name="mode" value="keep">
            {hy.settings.deleteKeep}
          </button>
          <button className="btn btn-ghost text-red-600" name="mode" value="wipe">
            {hy.settings.deleteWipe}
          </button>
        </form>

        <p className="note mt-2.5">{hy.settings.deleteHint}</p>
      </details>
    </>
  );
}
