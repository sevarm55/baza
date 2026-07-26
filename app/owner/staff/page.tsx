import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listStaff } from '@/lib/queries';
import { formatPhone } from '@/lib/phone';
import { hy } from '@/lib/i18n/hy';
import { archiveStaff, saveStaff } from '@/app/actions';
import { AddStaffForm } from './add-staff-form';

export default async function StaffPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

  const staff = await listStaff(tenant.id);

  return (
    <>
      <div className="grid gap-2">
        {staff.map((s) => (
          <form key={s.id} action={saveStaff} className="card grid gap-2">
            <input type="hidden" name="id" value={s.id} />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">{formatPhone(s.phone)}</span>
              <span className="text-[11.5px] text-muted">
                {s.role === 'owner' ? hy.roles.owner : tenant.staffRole}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="field min-w-0 flex-1 !py-2.5 !text-[15px]"
                name="name"
                defaultValue={s.name}
                required
              />
              <div className="relative shrink-0">
                <input
                  className="field w-20 !py-2.5 !pe-7 !text-[15px]"
                  name="percent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={s.percent}
                  required
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  %
                </span>
              </div>
              <button
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
                title={hy.settings.save}
              >
                ✓
              </button>
              {/* себя отключить нельзя — владелец потеряет доступ к кабинету */}
              {s.id !== session.uid && (
                <button
                  className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted hover:text-bad"
                  formAction={archiveStaff}
                  title={hy.settings.remove}
                >
                  ✕
                </button>
              )}
            </div>
          </form>
        ))}
      </div>

      <h2 className="mb-2.5 mt-6 text-[15px] font-semibold">{hy.settings.addStaff}</h2>
      <AddStaffForm staffRole={tenant.staffRole} />

      <p className="mt-3.5 rounded-[14px] border-l-[3px] border-accent bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
        {hy.settings.staffNote}
      </p>
      <p className="mt-2 px-1 text-[12.5px] leading-relaxed text-muted">
        {hy.settings.percentNote}
      </p>
    </>
  );
}
