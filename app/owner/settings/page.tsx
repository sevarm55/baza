import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices } from '@/lib/queries';
import { toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { archiveService, saveBusiness, saveService } from '@/app/actions';

export default async function SettingsPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

  const services = await listServices(tenant.id);

  return (
    <>
      <h2 className="mb-2.5 text-[15px] font-semibold">{hy.settings.services}</h2>

      <div className="grid gap-2">
        {services.map((s) => (
          /* Каждая строка — самостоятельная форма с двумя кнопками.
             Работает и без JavaScript, что для телефона в подвале мойки
             не теоретическое преимущество. */
          <form key={s.id} action={saveService} className="card flex items-center gap-2">
            <input type="hidden" name="id" value={s.id} />
            <input
              className="field min-w-0 flex-1 !py-2.5 !text-[15px]"
              name="name"
              defaultValue={s.name}
              required
            />
            <input
              className="field w-28 !py-2.5 !text-[15px]"
              name="price"
              type="number"
              min={0}
              step={toMajor(1, tenant.currency)}
              defaultValue={toMajor(s.price, tenant.currency)}
              required
            />
            <button
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
              title={hy.settings.save}
            >
              ✓
            </button>
            <button
              className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted hover:text-bad"
              formAction={archiveService}
              title={hy.settings.remove}
            >
              ✕
            </button>
          </form>
        ))}
      </div>

      <h2 className="mb-2.5 mt-6 text-[15px] font-semibold">{hy.settings.newService}</h2>
      <form action={saveService} className="card flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 !py-2.5 !text-[15px]"
          name="name"
          placeholder={hy.settings.name}
          required
        />
        <input
          className="field w-28 !py-2.5 !text-[15px]"
          name="price"
          type="number"
          min={0}
          placeholder={hy.settings.price}
          required
        />
        <button className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">
          +
        </button>
      </form>

      <p className="mt-3.5 rounded-[14px] border-l-[3px] border-accent bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
        {hy.settings.priceNote}
      </p>

      <h2 className="mb-2.5 mt-8 text-[15px] font-semibold">{hy.settings.export}</h2>
      <a
        className="btn btn-ghost text-center no-underline"
        href="/owner/export?days=30"
        download
      >
        {hy.settings.exportCsv}
      </a>

      <h2 className="mb-2.5 mt-8 text-[15px] font-semibold">{hy.settings.business}</h2>
      <form action={saveBusiness} className="card grid gap-2.5">
        <label className="grid gap-1.5">
          <span className="text-xs text-muted">{hy.settings.businessName}</span>
          <input className="field" name="name" defaultValue={tenant.name} required />
        </label>
        <button className="btn">{hy.settings.save}</button>
      </form>
    </>
  );
}
