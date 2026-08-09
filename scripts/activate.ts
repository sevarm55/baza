/**
 * Продление подписки. Запуск:
 *   npm run activate -- +37477111222 3
 *
 * Первые десятки клиентов платят переводом, и приём платежей в продукте
 * им не нужен — нужен способ отметить факт оплаты. Когда клиентов станет
 * столько, что это начнёт мешать, тогда и появится оплата картой.
 * Раньше — это работа впустую.
 */
import { and, eq, inArray } from 'drizzle-orm';

// третий аргумент нужен только владельцу нескольких точек: id или часть названия
const [rawPhone, rawMonths, which] = process.argv.slice(2);

if (!rawPhone) {
  console.error('использование: npm run activate -- <телефон владельца> [месяцев=1] [точка]');
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
  const owners = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.role, 'owner'), eq(users.active, true)));

  if (owners.length === 0) {
    console.error(`владелец с номером ${formatPhone(phone)} не найден`);
    process.exit(1);
  }

  /* У владельца может быть несколько точек. Молча взять любую значило бы
     однажды продлить не ту — или, хуже, обнулить оплату у работающей.
     Поэтому при неоднозначности отказываемся и показываем список. */
  let owner = owners[0];
  if (owners.length > 1) {
    const named = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(inArray(tenants.id, owners.map((o) => o.tenantId)));

    const hit = which
      ? named.filter((t) => t.id === which || t.name.toLowerCase().includes(which.toLowerCase()))
      : [];

    if (hit.length !== 1) {
      console.error(`у ${formatPhone(phone)} несколько точек — укажите, какую:`);
      for (const t of named) console.error(`  ${t.id}  ${t.name}`);
      process.exit(1);
    }
    owner = owners.find((o) => o.tenantId === hit[0].id)!;
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
