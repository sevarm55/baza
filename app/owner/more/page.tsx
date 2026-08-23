import { redirect } from 'next/navigation';
import { Building2, Download, UserRound } from 'lucide-react';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { passesEnabled } from '@/lib/features';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
import { localizeTenantOrNull } from '@/lib/i18n/terms';
import { sectionGroupsFor } from '@/components/sections';
import { LinkRow, LinkRows } from '@/components/patterns/detail-list';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';

/**
 * Карта разделов: всё, что не поместилось в нижние вкладки телефона.
 *
 * На компьютере все разделы стоят слева и видны всегда. На телефоне
 * колонки нет, и где-то они обязаны лежать целиком, иначе половина
 * продукта доступна только по прямой ссылке. Список тот же, что в
 * колонке, в тех же группах и в том же порядке: раздел, забытый там,
 * не появится и здесь. Ниже то, чего в колонке нет: филиалы, моя
 * страница и выгрузка.
 */
export default async function MorePage() {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const [raw, me] = await Promise.all([getTenant(session.tid), getUser(session.tid, session.uid)]);
  const tenant = localizeTenantOrNull(raw, t.locale);
  if (!tenant || !me) redirect('/session-ended');

  const points = me.accountId ? await listPoints(me.accountId) : [];
  const groups = sectionGroupsFor(passesEnabled(), t);

  return (
    /* Мера у́же общей меры кабинета: экран собран под телефон, и строки,
       растянутые на полторы тысячи точек, читались бы пустыми. */
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader className="mb-0" title={t.phone.moreTitle} description={t.phone.moreLead} />

      <Panel padded={false}>
        <div className="divide-y divide-border">
          {groups.map((group, i) => (
            <div key={group.key}>
              {group.label && (
                <p className="px-4 pt-3 pb-1 text-2xs font-medium tracking-wider text-muted-foreground uppercase">
                  {group.label}
                </p>
              )}
              <LinkRows>
                {group.items.map((section) => (
                  <LinkRow
                    key={section.href}
                    href={section.href}
                    title={section.label}
                    note={noteFor(section.href, t)}
                    icon={section.icon}
                  />
                ))}

                {/* Обслуживание продукта рядом с настройками: не сущности
                    бизнеса, а то, что трогают раз в год. */}
                {i === groups.length - 1 && (
                  <>
                    {/* Филиалы видит только тот, у кого их больше одного:
                        остальные не должны узнать, что вторые бывают. */}
                    {points.length > 1 && (
                      <LinkRow
                        href="/owner/points"
                        title={t.points.title}
                        note={<span className="num">{points.length}</span>}
                        icon={<Building2 aria-hidden />}
                      />
                    )}

                    {/* Моя страница: вход к языку, теме, PIN и выходу. На
                        телефоне это единственная дверь к ним. */}
                    <LinkRow
                      href="/owner/profile"
                      title={t.profile.title}
                      note={t.phone.profileLead}
                      icon={<UserRound aria-hidden />}
                    />

                    {/* Выгрузка приходит файлом и дальше принадлежит
                        человеку: не раздел, поэтому ссылка на файл без
                        стрелки перехода. */}
                    <LinkRow
                      href="/owner/export"
                      download
                      title={t.settings.export}
                      note={t.phone.exportLead}
                      icon={<Download aria-hidden />}
                      right={<span aria-hidden />}
                    />
                  </>
                )}
              </LinkRows>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Подпись раздела одной строкой там, где у него есть своя. */
function noteFor(href: string, t: Dict): string | undefined {
  switch (href) {
    case '/owner/calendar':
      return t.calendar.lead;
    case '/owner/clients':
      return t.phone.clientsLead;
    case '/owner/services':
      return t.phone.servicesLead;
    case '/owner/staff':
      return t.phone.teamLead;
    case '/owner/passes':
      return t.phone.passesLead;
    case '/owner/payroll':
      return t.payroll.lead;
    case '/owner/expenses':
      return t.phone.expensesLead;
    case '/owner/reports':
      return t.phone.reportsLead;
    case '/owner/settings':
      return t.phone.settingsLead;
    default:
      return undefined;
  }
}
