import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listStaff } from '@/lib/queries';
import { hy } from '@/lib/i18n/hy';
import { StaffRow } from '@/components/staff-row';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { AddStaffForm } from './add-staff-form';

export default async function StaffPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const staff = await listStaff(tenant.id);

  return (
    <>
      <PageHead title={hy.settings.staff} meta={hy.settings.percentNote} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <Panel title={hy.settings.staff} count={staff.length} className="lg:col-span-8">
          {/* Список людей: волосяная линия между строками и подсветка
              под курсором. Правку показывает сама строка, когда на неё
              навели, — читать список это не мешает. */}
          <div className="rows">
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
        </Panel>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Panel title={hy.settings.addStaff}>
            <AddStaffForm staffRole={tenant.staffRole} />
          </Panel>
          <p className="note">{hy.settings.staffNote}</p>
        </div>
      </div>
    </>
  );
}
