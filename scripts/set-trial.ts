/**
 * Сдвинуть окончание триала. Запуск:
 *   npm run trial -- +37477111222 7      продлить на 7 дней от сегодня
 *   npm run trial -- +37477111222 -1     состарить, чтобы проверить блокировку
 *
 * Нужен для двух вещей: посмотреть, как выглядит закрытый доступ,
 * и дать клиенту пару дней, когда он просит «ещё немного посмотреть».
 */
import { and, eq } from 'drizzle-orm';

const [rawPhone, rawDays] = process.argv.slice(2);

if (!rawPhone || rawDays === undefined) {
  console.error('использование: npm run trial -- <телефон владельца> <дней от сегодня>');
  process.exit(1);
}

const days = Number(rawDays);
if (!Number.isFinite(days)) {
  console.error('дней должно быть числом');
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

  const trialEndsAt = new Date(Date.now() + days * 86_400_000);
  // сбрасываем оплату: иначе она перебьёт триал и проверка ничего не покажет
  await db
    .update(tenants)
    .set({ plan: 'trial', trialEndsAt, paidUntil: null })
    .where(eq(tenants.id, owner.tenantId));

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, owner.tenantId));
  const access = accessOf(tenant);

  console.log(`\n${tenant.name}`);
  console.log(`триал до: ${trialEndsAt.toISOString().slice(0, 10)}`);
  console.log(`состояние: ${access.state} · осталось ${access.daysLeft} дн.`);
  console.log(`запись новых машин: ${access.canWrite ? 'разрешена' : 'закрыта'}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
