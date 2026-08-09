/**
 * Сдвинуть окончание триала. Запуск:
 *   npm run trial -- +37477111222 7      продлить на 7 дней от сегодня
 *   npm run trial -- +37477111222 -1     состарить, чтобы проверить блокировку
 *
 * Нужен для двух вещей: посмотреть, как выглядит закрытый доступ,
 * и дать клиенту пару дней, когда он просит «ещё немного посмотреть».
 */
import { and, eq, inArray } from 'drizzle-orm';

// третий аргумент нужен только владельцу нескольких точек: id или часть названия
const [rawPhone, rawDays, which] = process.argv.slice(2);

if (!rawPhone || rawDays === undefined) {
  console.error('использование: npm run trial -- <телефон владельца> <дней> [точка]');
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
