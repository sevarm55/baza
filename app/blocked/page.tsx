import { ChevronDown, Download } from 'lucide-react';
import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { currentAccess } from '@/lib/subscription';
import { getDict } from '@/lib/i18n/server';
import { PointForm } from '@/components/point-form';
import { SignOutButton } from '@/components/sign-out-button';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Стена: срок вышел.
 *
 * Вместо всего кабинета один экран. Порядок на нём неслучаен: сначала
 * что данные целы, потом как продолжить, и только в конце забрать
 * данные или уйти совсем. Сотруднику то же самое, но без кнопок:
 * платит не он.
 */
export default async function BlockedPage() {
  const t = await getDict();
  const session = await requireSession();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const access = currentAccess(tenant);
  // сюда попадают только закрытые: остальных возвращаем в продукт
  if (access.canRead) {
    redirect(session.role === 'owner' ? '/owner' : '/work');
  }

  const isOwner = session.role === 'owner';
  const blocked = access.state === 'blocked';
  /* Точку завели минуту назад, и «срок вышел» здесь было бы неправдой:
     оплаты просто ещё не было. */
  const fresh = access.state === 'unpaid';

  const me = await getUser(session.tid, session.uid);
  const others = me?.accountId
    ? (await listPoints(me.accountId)).filter((p) => p.id !== session.tid)
    : [];

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-background px-4 py-10 max-md:m-pad-x max-md:bg-m-board">
      <section className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 max-md:rounded-m-hero max-md:border-m-hair max-md:bg-m-surface max-md:p-5">
        <span role="img" aria-label={t.app.name} className="flex">
          <Wordmark />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
            {fresh ? t.points.freshTitle : blocked ? t.billing.blockedTitle : t.billing.wallTitle}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {fresh ? t.points.freshText : blocked ? t.billing.blockedText : t.billing.wallLead}
          </p>
        </div>

        {/* Одна закрытая точка не имеет права запирать открытую: владелец
            со второй мойкой должен дойти до первой, оплаченной. */}
        {others.length > 0 && (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {others.map((point) => (
              <PointForm key={point.id} tid={point.id}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      point.canRead ? 'bg-success' : 'bg-warning',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{point.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {point.canRead ? t.points.go : t.points.needsPayment}
                  </span>
                </button>
              </PointForm>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.billing.wallContinue}</p>
          {/* Звонок главное действие: продолжить хотят обе стороны. */}
          <Button size="lg" className="w-full" render={<a href="tel:+37499855546" />}>
            {t.billing.wallPhone}
          </Button>
        </div>

        {isOwner && (
          <div className="flex flex-col gap-4">
            {/* Выгружать у новой точки нечего. За всё время: человек
                уходит, и отдать ему тридцать дней вместо всей истории
                было бы обманом. */}
            {!fresh && (
              <Button
                variant="outline"
                className="w-full"
                render={<a href="/owner/export?days=all" download />}
              >
                <Download data-icon="inline-start" aria-hidden />
                {t.billing.wallDownload}
              </Button>
            )}

            {/* Форма прямо здесь, а не ссылкой в настройки: настройки
                закрыты вместе со всем кабинетом. За раскрывающимся
                заголовком: удаление необратимо и на глаза попадаться не
                должно. */}
            <Collapsible className="flex flex-col gap-3">
              <CollapsibleTrigger className="group/delete inline-flex items-center gap-1.5 self-start rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                {t.billing.wallDelete}
                <ChevronDown
                  className="size-3.5 transition-transform group-data-panel-open/delete:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>

              <CollapsibleContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">{t.billing.wallDeleteNote}</p>

                <form method="post" action="/owner/settings/delete" className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor="wall-delete-pin">{t.settings.deletePin}</FieldLabel>
                    <Input
                      id="wall-delete-pin"
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,6}"
                      maxLength={6}
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Button variant="destructive" className="w-full" name="mode" value="wipe">
                    {t.settings.deleteWipe}
                  </Button>
                </form>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="truncate text-xs text-muted-foreground">{tenant.name}</span>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
