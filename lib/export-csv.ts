import type { Tenant } from './db/schema';
import { exportOrders } from './queries';
import { toMajor } from './money';
import { hy } from './i18n/hy';
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
export async function buildOrdersCsv(tenant: Tenant, days: number | 'all') {
  /* 'all' — с самого первого дня бизнеса. Нужно при удалении аккаунта:
     прощальный архив за последние тридцать дней был бы обманом, человек
     забирает всё или не забирает ничего. */
  const from =
    days === 'all'
      ? tenant.createdAt
      : new Date(Date.now() - (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000);

  const rows = await exportOrders(tenant.id, from);

  const header = [
    'Ամսաթիվ',
    'Ժամ',
    tenant.clientIdLabel,
    'Ծառայություն',
    'Գին',
    'Վճարում',
    tenant.staffRole,
    'Տոկոս',
    hy.settings.exportEarned,
    hy.settings.exportCanceled,
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
    paymentLabel(r.payment),
    r.staffName ?? '',
    String(r.staffPercent),
    String(toMajor(Math.floor((r.price * r.staffPercent) / 100), tenant.currency)),
    r.canceledAt ? hy.common.yes : '',
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

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
