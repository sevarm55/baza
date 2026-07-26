/**
 * Продление подписки. Запуск:
 *   npm run activate -- +37477111222 3
 *
 * Первые десятки клиентов платят переводом, и приём платежей в продукте
 * им не нужен — нужен способ отметить факт оплаты. Когда клиентов станет
 * столько, что это начнёт мешать, тогда и появится оплата картой.
 * Раньше — это работа впустую.
 */
import { and, eq } from 'drizzle-orm';

const [rawPhone, rawMonths] = process.argv.slice(2);

if (!rawPhone) {
  console.error('использование: npm run activate -- <телефон владельца> [месяцев=1]');
  process.exit(1);
}

const months = Number(rawMonths ?? 1);
if (!Number.isInteger(months) || months < 1 || months > 36) {
  console.error('месяцев должно быть целым числом от 1 до 36');
  process.exit(1);
}

async function main() {
  const { ensureDb } = await import('../lib/db/ready');
  const { db } = await import('../lib/db');
  const { tenants, users } = await import('../lib/db/schema');
  const { normalizePhone, formatPhone } = await import('../lib/phone');
  const { accessOf } = await import('../lib/subscription');

  await ensureDb();

  const phone = normalizePhone(rawPhone);
  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.role, 'owner')));

  if (!owner) {
    console.error(`владелец с номером ${formatPhone(phone)} не найден`);
    process.exit(1);
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, owner.tenantId));

  // продлеваем от текущей даты окончания, если она ещё не прошла —
  // иначе оплативший заранее терял бы остаток
  const base =
    tenant.paidUntil && tenant.paidUntil.getTime() > Date.now()
      ? tenant.paidUntil
      : new Date();
  const paidUntil = new Date(base);
  paidUntil.setMonth(paidUntil.getMonth() + months);

  await db
    .update(tenants)
    .set({ plan: 'active', paidUntil })
    .where(eq(tenants.id, tenant.id));

  const after = accessOf({ plan: 'active', paidUntil, trialEndsAt: tenant.trialEndsAt });

  console.log(`\n${tenant.name}`);
  console.log(`владелец: ${owner.name} · ${formatPhone(phone)}`);
  console.log(`оплачено до: ${paidUntil.toISOString().slice(0, 10)}`);
  console.log(`осталось дней: ${after.daysLeft}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
