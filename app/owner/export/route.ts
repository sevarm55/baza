import { getSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { exportOrders, getTenant } from '@/lib/queries';
import { toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

/**
 * Выгрузка в CSV для Excel.
 *
 * Разделитель — точка с запятой: Excel в русской и армянской локали
 * иначе разложит одну строку в один столбец. BOM в начале — иначе он же
 * прочитает армянский как кракозябры.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'owner') {
    return new Response('Unauthorized', { status: 401 });
  }
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return new Response('Not found', { status: 404 });

  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') ?? 30);
  const from = new Date(Date.now() - (Number.isFinite(days) ? days : 30) * 86_400_000);

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

  const body = rows.map((r) => [
    isoDate(r.createdAt),
    hhmm(r.createdAt),
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
  const filename = `bazis-${isoDate(new Date())}.csv`;

  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function escape(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
