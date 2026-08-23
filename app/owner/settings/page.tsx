import { redirect } from 'next/navigation';
import { Building2, ChevronDown, Download, Tags, Users } from 'lucide-react';

import { requireOwner } from '@/lib/auth';
import { getTenant, getUser } from '@/lib/queries';
import { accountOf } from '@/lib/accounts';
import { deleteNeedsCode } from '@/lib/account';
import { maskPhone } from '@/lib/phone';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull } from '@/lib/i18n/terms';
import { LinkRow, LinkRows } from '@/components/patterns/detail-list';
import { FormMessage } from '@/components/patterns/form';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SubNav, SubNavLayout } from '@/app/owner/profile/sub-nav';
import { BusinessForm } from './business-form';

/**
 * Настройки бизнеса: то, что трогают раз в год.
 *
 * Одна стопка панелей сверху вниз, как форму и читают: название и
 * переходы к справочникам, выгрузка своих данных, и в самом низу, за
 * раскрывающимся заголовком, удаление. Прейскурант, люди и филиалы живут
 * в своих разделах, здесь на них только двери.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; delete?: string; cid?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();

  const asked = await searchParams;
  /* Старый адрес прейскуранта: сохранённая ссылка обязана открывать
     услуги, а не настройки без вкладки, которую в ней ищут. */
  if (asked.s === 'services') redirect('/owner/services');

  /* Слова бизнеса на языке того, кто смотрит; копия уходит только на
     экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  /* Чем человек подтверждает удаление, решает состояние его аккаунта:
     у заведённых по коду из SMS PIN нет вовсе (см. lib/account.ts). */
  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');
  const account = await accountOf(me);
  const byCode = deleteNeedsCode(account);

  /* Маршрут удаления возвращает сюда с причиной отказа: ответом он
     отдаёт либо файл, либо редирект. Заявка на код живёт в адресе. */
  const failure = asked.delete;
  const challengeId = failure === 'sent' || failure === 'code' ? (asked.cid ?? '') : '';

  const deleteError =
    failure === 'pin'
      ? t.settings.deleteWrongPin
      : failure === 'throttled'
        ? t.settings.deleteThrottled
        : failure === 'code'
          ? t.settings.deleteCodeWrong
          : failure === 'codeExpired'
            ? t.settings.deleteCodeExpired
            : failure === 'sms'
              ? t.settings.deleteSmsFailed
              : failure && failure !== 'sent'
                ? t.settings.deleteFailed
                : null;

  const nav = [
    { id: 'business', label: t.settings.business },
    { id: 'data', label: t.settings.export },
    { id: 'delete', label: t.settings.deleteTitle },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.owner.tabSettings} description={t.settings.lead} />

      <SubNavLayout nav={<SubNav label={t.owner.tabSettings} items={nav} />}>
        <Panel id="business" title={t.settings.business} className="scroll-mt-16" padded={false}>
          <div className="p-4">
            <BusinessForm name={tenant.name} />
          </div>

          {/* Справочники: переходы, а не действия, и живут строками в том
              же приборе, что название. */}
          <LinkRows className="border-t border-border">
            <LinkRow href="/owner/points" title={t.points.title} icon={<Building2 aria-hidden />} />
            <LinkRow href="/owner/services" title={t.settings.tabServices} icon={<Tags aria-hidden />} />
            <LinkRow href="/owner/staff" title={t.settings.staff} icon={<Users aria-hidden />} />
          </LinkRows>
        </Panel>

        <Panel id="data" title={t.settings.export} className="scroll-mt-16">
          <p className="text-sm text-muted-foreground">{t.settings.exportNote}</p>
          <div className="mt-4">
            <Button variant="outline" render={<a href="/owner/export?days=30" download />}>
              <Download data-icon="inline-start" aria-hidden />
              {t.settings.exportCsv}
            </Button>
          </div>
        </Panel>

        <DangerZone
          deleteError={deleteError}
          byCode={byCode}
          challengeId={challengeId}
          phone={maskPhone(account.phone)}
          codeSent={failure === 'sent' || failure === 'code'}
        />
      </SubNavLayout>
    </div>
  );
}

/**
 * Удаление бизнеса.
 *
 * За раскрывающимся заголовком и последним на странице: действие
 * необратимое, и на глаза оно попадаться не должно, его ищут
 * осознанно. Раскрыто только когда сюда вернулись с отказом или с
 * высланным кодом: форма, которую человек уже начал, не должна
 * схлопываться у него под руками.
 */
async function DangerZone({
  deleteError,
  byCode,
  challengeId,
  phone,
  codeSent,
}: {
  deleteError: string | null;
  /** у человека нет PIN: подтверждать он будет кодом из SMS */
  byCode: boolean;
  challengeId: string;
  /** куда ушёл код; номер показывается закрытым */
  phone: string;
  codeSent: boolean;
}) {
  const t = await getDict();

  /* Три состояния формы:
       есть PIN               поле кода-пароля;
       нет PIN, код не слан   одна кнопка «выслать код»;
       нет PIN, код слан      поле кода и оба выхода.
     Пока SMS не ушла, показывать пустое поле кода значит просить ввести
     то, чего у человека нет. */
  const askCode = byCode && codeSent;
  const askSend = byCode && !codeSent;

  return (
    <Collapsible
      id="delete"
      defaultOpen={deleteError !== null || codeSent}
      className="scroll-mt-16 rounded-lg border border-destructive/30 bg-card"
    >
      <CollapsibleTrigger className="group/danger flex w-full items-start justify-between gap-3 rounded-lg px-4 pt-3.5 pb-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="min-w-0">
          <span className="block text-sm leading-tight font-semibold">{t.settings.deleteTitle}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t.settings.deleteWhat}</span>
        </span>
        <ChevronDown
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/danger:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border px-4 py-4">
        <p className="text-sm font-medium text-destructive">{t.settings.deleteNoWayBack}</p>

        <form method="post" action="/owner/settings/delete" className="mt-4 flex flex-col gap-4">
          {askSend ? (
            <>
              <p className="text-sm text-muted-foreground">{t.settings.deleteCodeAsk}</p>
              {deleteError && <FormMessage>{deleteError}</FormMessage>}
              {/* Первый шаг ничего не удаляет, он только высылает код:
                  поэтому кнопка одна и не разрушительная. */}
              <div>
                <Button type="submit" variant="outline" name="mode" value="code">
                  {t.settings.deleteSendCode}
                </Button>
              </div>
            </>
          ) : (
            <>
              {askCode ? (
                <>
                  <input type="hidden" name="challengeId" value={challengeId} />
                  <Field className="max-w-xs">
                    <FieldLabel htmlFor="delete-code">{t.settings.deleteCodeAsk}</FieldLabel>
                    <Input
                      id="delete-code"
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      /* Тот же autoComplete, что на входе: телефон
                         подставляет код из пришедшей SMS сам. */
                      autoComplete="one-time-code"
                      required
                    />
                    <FieldDescription className="text-xs">
                      {t.settings.deleteCodeSent(phone)}
                    </FieldDescription>
                  </Field>
                </>
              ) : (
                <Field className="max-w-xs">
                  <FieldLabel htmlFor="delete-pin">{t.settings.deletePin}</FieldLabel>
                  <Input
                    id="delete-pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,6}"
                    maxLength={6}
                    autoComplete="off"
                    required
                  />
                </Field>
              )}

              {deleteError && <FormMessage>{deleteError}</FormMessage>}

              {/* Сохраняющий путь первым: по умолчанию человек уносит
                  свои данные с собой, а не теряет их молча. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" name="mode" value="keep">
                  {t.settings.deleteKeep}
                </Button>
                <Button type="submit" variant="destructive" name="mode" value="wipe">
                  {t.settings.deleteWipe}
                </Button>
              </div>
            </>
          )}
        </form>

        <p className="mt-3 text-xs text-muted-foreground">{t.settings.deleteHint}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
