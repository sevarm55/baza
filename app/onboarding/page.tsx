import { redirect } from 'next/navigation';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser, listServices } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { resolveFirstRun } from '@/lib/first-run';
import { NICHES, type NicheKey } from '@/lib/niches';
import { currencySymbol, formatMoney, toMajor } from '@/lib/money';
import { hhmm } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { localizeTenant, serviceNameTerm } from '@/lib/i18n/terms';
import type { Dict } from '@/lib/i18n';
import { LanguagePicker } from '@/components/language-picker';
import { SignOutButton } from '@/components/sign-out-button';
import { Wordmark } from '@/components/wordmark';
import { FirstRunFlow } from './flow';
import { Finale } from './finale';

/**
 * Сценарий первого запуска: отдельная поверхность, а не страница
 * кабинета.
 *
 * Новый владелец не должен встречать продукт пустой сводкой с девятью
 * разделами в колонке. Здесь нет ни колонки, ни колокольчика — только
 * марка, прогресс и один шаг за раз: настроил → нанял → посмотрел
 * глазами работника → записал машину → увидел результат. Все действия
 * настоящие, и всё сделанное здесь остаётся в бизнесе.
 *
 * Куда попадает человек, решают данные (lib/first-run.ts): обновление
 * страницы продолжает сценарий с последнего рубежа, а не сначала.
 */
export default async function FirstRunPage() {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const [raw, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!raw || !me) redirect('/session-ended');

  /* Заблокированный бизнес сценарий не ведёт: шаги пишут в базу, а
     запись закрыта подпиской. Кабинет объяснит это лучше. */
  if (!currentAccess(raw).canRead) redirect('/blocked');

  const view = await resolveFirstRun(raw, me);
  if (view.kind === 'owner') redirect('/owner');

  const tenant = localizeTenant(raw, t.locale);
  const symbol = currencySymbol(tenant.currency);
  const moneyStep = toMajor(1, tenant.currency);
  const niche = NICHES[tenant.niche as NicheKey];

  let body: React.ReactNode;

  if (view.kind === 'finale') {
    const name = view.order.authorName ?? view.worker?.name ?? null;
    body = (
      <Finale
        lead={name ? t.firstRun.fLead(name) : null}
        order={{
          clientKey: view.order.clientKey,
          serviceName: serviceNameTerm(view.order.serviceName, t.locale),
          price: formatMoney(view.order.price, tenant.currency, t.locale),
          payment: paymentLabel(view.order.payment, t),
          time: hhmm(view.order.createdAt, tenant.timezone),
          author: name,
          role: tenant.staffRole,
        }}
      />
    );
  } else {
    const services = await listServices(tenant.id);
    const step =
      view.kind === 'services' ? 1 : view.kind === 'expense' ? 2 : view.kind === 'staff' ? 3 : 4;

    body = (
      <FirstRunFlow
        step={step}
        again={view.kind === 'meet' && view.again}
        services={services.map((s) => ({
          id: s.id,
          name: serviceNameTerm(s.name, t.locale),
          price: toMajor(s.price, tenant.currency),
        }))}
        /* Подсказки быстрого добавления — из конфига ниши: те же
           услуги, которыми засевается новый бизнес. Убранная с шага
           услуга возвращается одним нажатием. */
        presets={(niche?.services ?? []).map((s) => ({
          name: serviceNameTerm(s.name, t.locale),
          price: toMajor(s.price, tenant.currency),
        }))}
        currencySymbol={symbol}
        moneyStep={moneyStep}
        expenseHints={t.expenses.hints}
        staffRole={tenant.staffRole}
        defaultPercent={niche?.defaultPercent ?? 40}
        worker={
          view.kind === 'meet' ? { name: view.worker.name, phone: view.worker.phone } : null
        }
      />
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background max-md:bg-m-board">
      {/* Минимальная полоса: марка и две тихие кнопки. Ни колонки, ни
          разделов — основной интерфейс не должен отвлекать от шага. */}
      <header className="safe-top sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3 max-md:h-[var(--m-top-h)] max-md:border-m-hair max-md:bg-m-board md:px-4">
        <span className="flex shrink-0 items-center" aria-label={t.app.name} role="img">
          <Wordmark />
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <LanguagePicker compact />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6 max-md:m-pad-x max-md:pb-8 md:py-10">
        {body}
      </main>
    </div>
  );
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
