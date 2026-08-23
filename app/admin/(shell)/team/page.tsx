import { listAdminSessions, requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { listAdmins } from '@/lib/admin-queries';
import { deviceLabel } from '@/lib/security-log';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { when } from '@/components/admin/format';
import { AddAdminForm, AdminRow, SessionRow } from '@/components/admin/team';

/** Кто заходит в админку: роли, последний вход, сессии. */
export default async function TeamPage() {
  const ctx = await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const [admins, sessions] = await Promise.all([listAdmins(), listAdminSessions(ctx.admin.id)]);
  const isOwner = ctx.role === 'owner';

  return (
    <>
      <PageHeader className="mb-0" title={a.team.title} description={a.team.lead} />
      <PanelGrid>
        <Panel className="lg:col-span-8" title={a.nav.team} count={admins.length} description={a.team.rolesNote} padded={false}>
          <ul className="divide-y divide-border">
            {admins.map((adm) => (
              <AdminRow
                key={adm.id}
                admin={{ id: adm.id, name: adm.name, phone: adm.phone, role: adm.role, active: adm.active, lastLoginAt: adm.lastLoginAt ? when(adm.lastLoginAt) : null }}
                self={adm.id === ctx.admin.id}
                canManage={isOwner}
              />
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-4">
          {isOwner && (
            <Panel title={a.team.add} description={a.team.addLead}>
              <AddAdminForm />
            </Panel>
          )}
          <Panel title={a.team.mySessions} count={sessions.length || undefined} padded={false}>
            {sessions.length === 0 ? (
              <EmptyState compact title={a.common.empty} />
            ) : (
              <ul className="divide-y divide-border">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={{ id: s.id, label: deviceLabel(s.agent) ?? a.common.device, ip: s.ip, lastSeen: when(s.lastSeenAt), current: s.id === ctx.sessionId }}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PanelGrid>
    </>
  );
}
