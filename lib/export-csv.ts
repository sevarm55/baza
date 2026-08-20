import type { Tenant } from './db/schema';
import type { Dict } from './i18n';
import { exportOrders } from './queries';
import { toMajor } from './money';
import { DEFAULT_LOCALE, dict } from './i18n';
import { clientIdLabelTerm, serviceNameTerm, staffRoleTerm } from './i18n/terms';
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
    serviceNameTerm(r.serviceName, locale),
    String(toMajor(r.price, tenant.currency)),
    paymentLabel(r.payment, t),
    /* Все, кто мыл, а не один автор записи. У одиночной мойки это то же
       самое имя, что и раньше; у совместной — весь состав через ту же
       точку, которой продукт разделяет факты везде. Назвать здесь одного
       значило бы приписать ему весь фонд машины. */
    crewNames(r) || (r.staffName ?? ''),
    String(r.staffPercent),
    /* Начислено ПО ЭТОЙ МАШИНЕ целиком. У совместной это фонд всей
       команды, а не доля одного: столбец складывают, и сумма по нему
       обязана давать расход на зарплату, а не его часть. Кому сколько из
       фонда — вопрос ведомости, и раскладывать его внутри одной строки
       архива значило бы разложить одну машину на несколько строк. */
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

/** «Арман · Давид · Карен». Пусто — состава нет, зовём автора записи. */
function crewNames(row: { crew: { name: string | null }[] }): string {
  return row.crew
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n))
    .join(' · ');
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
