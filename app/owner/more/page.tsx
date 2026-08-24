import { redirect } from 'next/navigation';
import { Building2, Download, LogOut, UserRound } from 'lucide-react';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getRevenueSeries, getTenant, getUser, startOfDay } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { passesEnabled } from '@/lib/features';
import { ymd } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
import { localizeTenantOrNull } from '@/lib/i18n/terms';
import { sectionGroupsFor } from '@/components/sections';
import { LinkRow, LinkRows } from '@/components/patterns/detail-list';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';
import { MobileTitle } from '@/components/mobile';
import { SignOutButton } from '@/components/sign-out-button';
import { WeekStrip } from './week-strip';

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

  /* Последняя неделя для ленты дней. Считается тем же запросом, что
     график сводки, и в том же поясе бизнеса: две разные выручки за один
     день на соседних экранах читались бы ошибкой расчёта. */
  const todayKey = ymd(new Date(), tenant.timezone);
  const from = new Date(startOfDay(tenant.timezone).getTime() - 6 * 86_400_000);
  const series = await getRevenueSeries(tenant.id, from, tenant.timezone, 'day').catch(() => []);
  const byDay = new Map(series.map((s) => [s.key.slice(0, 10), s]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = ymd(new Date(from.getTime() + i * 86_400_000), tenant.timezone);
    const found = byDay.get(key);
    return { key, revenue: found?.revenue ?? 0, count: found?.count ?? 0 };
  });

  return (
    /* Мера у́же общей меры кабинета: экран собран под телефон, и строки,
       растянутые на полторы тысячи точек, читались бы пустыми. */
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader className="mb-0" title={t.phone.moreTitle} description={t.phone.moreLead} />

      {/* На телефоне это корень вкладки, и шапка над ним показывает
          филиал, а не название страницы: заголовок нужен свой. Повтор
          имени вкладки здесь не лишний — вкладка это где я нахожусь,
          заголовок это с чего начинается страница. */}
      <MobileTitle title={t.phone.moreTitle} lead={t.phone.moreLead} className="md:hidden" />

      <WeekStrip days={week} timezone={tenant.timezone} todayKey={todayKey} />

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

      {/* Выход — единственное действие на экране, где всё остальное
          места, куда переходят. Поэтому он стоит последним и за
          отбивкой, а не строкой среди разделов.

          Знак приглушённый, а не красный: красный в продукте значит
          ровно «удалить», и путать эти два сигнала нельзя. */}
      <div className="overflow-hidden rounded-lg border border-border bg-card max-md:rounded-m-card max-md:border-m-hair max-md:bg-m-surface">
        <div className="flex min-h-[60px] items-center gap-3.5 px-4 py-2 max-md:gap-3.5">
          <LogOut aria-hidden className="size-[19px] shrink-0 text-muted-foreground" />
          <SignOutButton labelled variant="ghost" />
        </div>
      </div>
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
