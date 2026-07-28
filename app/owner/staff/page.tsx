import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listStaff } from '@/lib/queries';
import { hy } from '@/lib/i18n/hy';
import { StaffRow } from '@/components/staff-row';
import { AddStaffForm } from './add-staff-form';

export default async function StaffPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const staff = await listStaff(tenant.id);

  return (
    <>
      <div className="grid gap-2.5">
        {staff.map((s) => (
          <StaffRow
            key={s.id}
            id={s.id}
            name={s.name}
            phone={s.phone}
            percent={s.percent}
            roleLabel={s.role === 'owner' ? hy.roles.owner : tenant.staffRole}
            // себя отключить нельзя — владелец потеряет доступ к кабинету
            canRemove={s.id !== session.uid}
          />
        ))}
      </div>

      <h2 className="h-section">{hy.settings.addStaff}</h2>
      <AddStaffForm staffRole={tenant.staffRole} />

      <p className="note mt-3.5">{hy.settings.staffNote}</p>
      <p className="mt-2.5 px-1 text-[12.5px] leading-relaxed text-faint">
        {hy.settings.percentNote}
      </p>
    </>
  );
}
