import type { Dict } from './i18n';
import { serviceNameTerm } from './i18n/terms';
import type { ActivityRow } from './activity-types';

/**
 * Фраза ленты из события.
 *
 * Одна функция на сервер, браузер и приложение: событие лежит в базе
 * ключами и числами, а словами становится на языке того, кто смотрит.
 * Поэтому здесь нет ни одного слова из кода, только словарь.
 *
 * Строка собирается без глаголов в прошедшем времени: по-русски у них
 * есть род, а имя в ленте не говорит, кто перед нами. «Давид · Новая
 * машина · 77GG477» читается одинаково про всех и сканируется быстрее
 * предложения.
 */
export type ActivityPhrase = {
  /** имя действующего лица; «Система» у автоматических событий */
  actor: string;
  /** название события: «Новая машина», «Начало смены» */
  action: string;
  /** что именно: номер, услуга, категория, имя */
  object: string | null;
  /** сумма, уже с валютой; отдельно, чтобы стоять в своём столбце */
  amount: string | null;
  /** уточнение мелким: «вместо 6 000 ֏», «вместе с Арманом» */
  note: string | null;
  /** знак события для цвета значка */
  tone: 'default' | 'success' | 'warning' | 'danger' | 'brand';
};

export function activityPhrase(
  row: ActivityRow,
  t: Dict,
  money: (n: number) => string,
): ActivityPhrase {
  const a = t.activity;
  const d = row.data;
  const actor = row.actorRole === 'system' ? a.system : (row.actorName ?? a.someone);
  const action = a.types[row.type];
  const service = d.service ? serviceNameTerm(d.service, t.locale) : null;
  const dot = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;

  switch (row.type) {
    case 'shift.started':
      return { actor, action, object: null, amount: null, note: null, tone: 'success' };

    case 'shift.finished': {
      const parts: string[] = [];
      if (typeof d.cashExpected === 'number' && d.cashExpected > 0) {
        parts.push(a.details.cashExpected(money(d.cashExpected)));
      }
      if (typeof d.cashDeclared === 'number') {
        parts.push(a.details.cashDeclared(money(d.cashDeclared)));
        const diff = d.cashDeclared - (d.cashExpected ?? 0);
        if (diff !== 0) parts.push(`${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`);
      }
      const short = typeof d.cashExpected === 'number' && d.cashExpected > 0 && d.cashDeclared === null;
      const mismatch =
        typeof d.cashDeclared === 'number' && d.cashDeclared !== (d.cashExpected ?? 0);
      return {
        actor: row.actorRole === 'system' ? (row.actorName ?? a.system) : actor,
        action,
        object: null,
        amount: null,
        note: dot(...parts, row.actorRole === 'system' ? a.details.auto : null, short ? a.details.notDeclared : null),
        tone: mismatch || short ? 'warning' : 'default',
      };
    }

    case 'car.created':
      return {
        actor,
        action,
        object: dot(d.key, service),
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: dot(
          d.listPrice && d.amount !== undefined && d.listPrice > d.amount
            ? a.details.instead(money(d.listPrice))
            : null,
          d.crew && d.crew.length > 1 ? a.details.together(d.crew.join(', ')) : null,
          d.payment ? paymentWord(d.payment, t) : null,
        ),
        tone: 'brand',
      };

    case 'car.updated':
      return {
        actor,
        action: d.change === 'crew' ? a.types['car.updated'] : action,
        object: dot(d.key, service),
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: d.crew && d.crew.length > 0 ? `→ ${d.crew.join(', ')}` : null,
        tone: 'default',
      };

    case 'car.canceled':
      return {
        actor,
        action,
        object: dot(d.key, service),
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: null,
        tone: 'danger',
      };

    case 'expense.created':
    case 'expense.updated':
    case 'expense.deleted':
      return {
        actor,
        action,
        object: d.category ?? null,
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: d.monthly ? a.details.monthly : null,
        tone: row.type === 'expense.deleted' ? 'danger' : 'warning',
      };

    case 'employee.created':
      return {
        actor,
        action,
        object: d.name ?? null,
        amount: null,
        note: typeof d.percent === 'number' ? `${d.percent}%` : null,
        tone: 'success',
      };

    case 'employee.updated':
      return { actor, action, object: d.name ?? null, amount: null, note: null, tone: 'default' };

    case 'employee.removed':
      return { actor, action, object: d.name ?? null, amount: null, note: null, tone: 'danger' };

    case 'salary.changed':
      return {
        actor,
        action,
        object: d.name ?? null,
        amount: null,
        note:
          typeof d.percent === 'number'
            ? typeof d.percentFrom === 'number'
              ? `${d.percentFrom}% → ${d.percent}%`
              : `${d.percent}%`
            : null,
        tone: 'warning',
      };

    case 'service.created':
    case 'service.updated':
      return {
        actor,
        action,
        object: service,
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: null,
        tone: 'default',
      };

    case 'service.archived':
      return { actor, action, object: service, amount: null, note: null, tone: 'default' };

    case 'client.created':
      return { actor, action, object: d.key ?? null, amount: null, note: null, tone: 'success' };

    case 'payout.made':
      return {
        actor,
        action,
        object: d.name ?? null,
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: typeof d.count === 'number' && d.count > 1 ? a.details.days(d.count) : null,
        tone: 'warning',
      };

    case 'pass.sold':
      return {
        actor,
        action,
        object: dot(d.key, service),
        amount: typeof d.amount === 'number' ? money(d.amount) : null,
        note: typeof d.count === 'number' ? a.details.uses(d.count) : null,
        tone: 'brand',
      };

    case 'settings.changed':
      return {
        actor,
        action,
        object:
          d.what === 'business'
            ? a.details.settings.business
            : d.what === 'teamPercent'
              ? a.details.settings.teamPercent
              : d.what === 'tiers'
                ? a.details.settings.tiers
                : null,
        amount: null,
        note:
          d.what === 'teamPercent'
            ? typeof d.percent === 'number'
              ? `${d.percent}%`
              : a.details.off
            : d.what === 'business' && d.name
              ? d.name
              : null,
        tone: 'default',
      };
  }
}

function paymentWord(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
