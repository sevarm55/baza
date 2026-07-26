import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices } from '@/lib/queries';
import { currencySymbol, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { saveBusiness } from '@/app/actions';
import { ServiceRow } from '@/components/service-row';
import { AddServiceForm } from './add-service-form';

export default async function SettingsPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

  const services = await listServices(tenant.id);
  const symbol = currencySymbol(tenant.currency);
  const step = toMajor(1, tenant.currency);

  return (
    <>
      <h2 className="h-section !mt-0">{hy.settings.services}</h2>

      <div className="grid gap-2.5">
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
    </>
  );
}
