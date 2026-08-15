import type { Tenant } from './db/schema';
import type { Dict } from './i18n';
import { exportOrders } from './queries';
import { toMajor } from './money';
import { DEFAULT_LOCALE, dict } from './i18n';
import { clientIdLabelTerm, staffRoleTerm } from './i18n/terms';
import { hhmm, ymd } from './time';

/**
 * Выгрузка в CSV для Excel.
 *
 * Разделитель — точка с запятой: Excel в русской и армянской локали иначе
 * разложит одну строку в один столбец. BOM в начале — иначе он же
 * прочитает армянский как кракозябры.
 *
 * Живёт отдельно от маршрута, потому что файл отдают двое: кабинет в
 * браузере и приложение. Файл при этом обязан быть один и тот же —
 * владелец не должен обнаружить, что выгрузки с телефона и с компьютера
 * отличаются столбцами.
 */
export async function buildOrdersCsv(
  tenant: Tenant,
  days: number | 'all',
  /* Язык шапки и слова «отменено». Приходит снаружи: файл забирают двое —
     кабинет на языке страницы и приложение на языке телефона. Цифры,
     номера и названия услуг от языка не зависят: это данные. */
  locale: string = DEFAULT_LOCALE,
) {
  const t = dict(locale);
  /* 'all' — с самого первого дня бизнеса. Нужно при удалении аккаунта:
     прощальный архив за последние тридцать дней был бы обманом, человек
     забирает всё или не забирает ничего. */
  const from =
    days === 'all'
      ? tenant.createdAt
      : new Date(Date.now() - (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000);

  const rows = await exportOrders(tenant.id, from);

  const header = [
    t.csv.date,
    t.csv.time,
    clientIdLabelTerm(tenant.clientIdLabel, locale),
    t.csv.service,
    t.csv.price,
    t.csv.payment,
    staffRoleTerm(tenant.staffRole, locale),
    t.csv.percent,
    t.settings.exportEarned,
    t.settings.exportCanceled,
  ];

  /* Дата и время — в часовом поясе мойки, а не сервера. Через `getHours()`
     выгрузка сдвигалась на часы контейнера: у ереванской мойки ночная
     запись уезжала во вчерашний день, и сумма за день в файле не сходилась
     с суммой за день на экране. */
  const body = rows.map((r) => [
    ymd(r.createdAt, tenant.timezone),
    hhmm(r.createdAt, tenant.timezone),
    r.clientKey ?? '',
    r.serviceName,
    String(toMajor(r.price, tenant.currency)),
    paymentLabel(r.payment, t),
    r.staffName ?? '',
    String(r.staffPercent),
    String(toMajor(Math.floor((r.price * r.staffPercent) / 100), tenant.currency)),
    r.canceledAt ? t.common.yes : '',
  ]);

  const csv = [header, ...body].map((line) => line.map(escape).join(';')).join('\r\n');

  return {
    // BOM обязателен, иначе Excel прочитает армянский как мусор
    content: '﻿' + csv,
    filename: `bazis-${ymd(new Date(), tenant.timezone)}.csv`,
    rows: rows.length,
  };
}

function escape(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
