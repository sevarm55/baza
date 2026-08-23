import { listAdminSessions, requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { deviceLabel } from '@/lib/security-log';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { EmptyState } from '@/components/patterns/states';
import { when } from '@/components/admin/format';
import { SessionRow } from '@/components/admin/session-row';

/**
 * Доступ: чей это вход и откуда он сейчас открыт.
 *
 * Учётные данные живут в окружении сервера (ADMIN_LOGIN и
 * ADMIN_PASSWORD или ADMIN_PASSWORD_HASH), поэтому здесь их не видно и
 * не поменять: это сделано нарочно, чтобы доступ к базе не давал
 * доступа к админке. Здесь только сессии: чужой браузер или забытая
 * вкладка гасятся одним нажатием.
 */
export default async function AccessPage() {
  const ctx = await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const sessions = await listAdminSessions();

  return (
    <>
      <PageHeader className="mb-0" title={a.access.title} description={a.access.lead} />
      <PanelGrid>
        <Panel className="lg:col-span-5" title={a.access.creds}>
          <DetailList>
            <DetailRow label={a.access.login} value={ctx.name} mono />
            <DetailRow label={a.access.role} value={a.roles.owner} />
          </DetailList>
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{a.access.credsNote}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <code className="num">ADMIN_LOGIN</code> · <code className="num">ADMIN_PASSWORD</code> ·{' '}
            <code className="num">ADMIN_PASSWORD_HASH</code>
          </p>
        </Panel>

        <Panel className="lg:col-span-7" title={a.access.sessions} count={sessions.length || undefined} padded={false}>
          {sessions.length === 0 ? (
            <EmptyState compact title={a.common.empty} />
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={{
                    id: s.id,
                    label: deviceLabel(s.agent) ?? a.common.device,
                    ip: s.ip,
                    lastSeen: when(s.lastSeenAt),
                    current: s.id === ctx.sessionId,
                  }}
                />
              ))}
            </ul>
          )}
        </Panel>
      </PanelGrid>
    </>
  );
}
