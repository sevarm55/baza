/**
 * Новая мойка для проверки руками: трое мойщиков, у каждого две машины
 * за сегодня, аренда и прайс с классами.
 *
 * Запуск: npx tsx scripts/seed-carwash.ts
 *
 * Заводит СВОЙ бизнес и ничего чужого не трогает. Телефон и коды
 * печатаются в конце — ими и входить.
 */
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* нет файла — переменные пришли из окружения */
}

/** Класс машины меняет цену всей услуги, а не отдельной строки. */
const TIERS = ['Սեդան', 'Կրոսովեր'] as const;

/** Прайс: базовая цена — седан, вторая — кроссовер. */
const PRICES = [
  { name: 'Կոմպլեքս', sedan: 4000, crossover: 5500 },
  { name: 'Թափք', sedan: 2500, crossover: 3500 },
  { name: 'Սալոն', sedan: 3000, crossover: 4000 },
  { name: 'Քիմմաքրում', sedan: 12000, crossover: 15000 },
] as const;

const CREW = [
  { name: 'Աշոտ', phone: '077 501 001', password: 'Tetrin-901111', percent: 30 },
  { name: 'Դավիթ', phone: '077 501 002', password: 'Tetrin-672222', percent: 40 },
  { name: 'Կարեն', phone: '077 501 003', password: 'Tetrin-443333', percent: 50 },
] as const;

/** По две машины на каждого: у одного седан, у другого кроссовер. */
const WORK = [
  [{ plate: '11 AA 111', service: 'Կոմպլեքս', tier: 'Սեդան', pay: 'cash' },
   { plate: '22 BB 222', service: 'Թափք', tier: 'Կրոսովեր', pay: 'card' }],
  [{ plate: '33 CC 333', service: 'Սալոն', tier: 'Սեդան', pay: 'cash' },
   { plate: '44 DD 444', service: 'Կոմպլեքս', tier: 'Կրոսովեր', pay: 'transfer' }],
  [{ plate: '55 EE 555', service: 'Քիմմաքրում', tier: 'Կրոսովեր', pay: 'card' },
   { plate: '66 FF 666', service: 'Թափք', tier: 'Սեդան', pay: 'cash' }],
] as const;

async function main() {
  const { ensureDb } = await import('../lib/db/ready');
  const { createBusiness } = await import('../lib/tenant');
  const { addStaff, upsertService, archiveService, tierIndexOf, priceForTier } =
    await import('../lib/catalog');
  const { createOrder } = await import('../lib/orders');
  const { addExpense } = await import('../lib/expenses');
  const { openShift } = await import('../lib/shifts');
  const { startOfDay } = await import('../lib/time');
  const { listServices } = await import('../lib/queries');
  const { db } = await import('../lib/db');
  const { tenants } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { formatMoney } = await import('../lib/money');

  await ensureDb();

  const OWNER_PHONE = '077 500 000';
  const OWNER_PASSWORD = 'Tetrin-439090';

  const { tenant, owner } = await createBusiness({
    niche: 'carwash',
    businessName: 'Ավտոլվացում Արշակունյաց',
    ownerName: 'Գագիկ',
    phone: OWNER_PHONE,
    password: OWNER_PASSWORD,
  });

  /* Классы машин. Ниша заводит бизнес без них, а цена по классу — это
     то, ради чего прайс вообще существует на мойке. */
  await db.update(tenants).set({ tiers: [...TIERS] }).where(eq(tenants.id, tenant.id));
  const withTiers = { ...tenant, tiers: [...TIERS] };

  /* Прайс заводим свой, а засеянный нишей убираем: иначе рядом с
     «Комплекс 4 000» стоял бы второй «Комплекс» из конфига, и мойщик
     выбирал бы наугад. */
  for (const s of await listServices(tenant.id)) {
    await archiveService({ tenantId: tenant.id, id: s.id });
  }

  for (const p of PRICES) {
    await upsertService({
      tenantId: tenant.id,
      name: p.name,
      price: p.sedan,
      tierPrices: [p.sedan, p.crossover],
    });
  }

  const price = await listServices(tenant.id);
  const byName = new Map(price.map((s) => [s.name, s]));

  /* Люди. Ставки разные — так и бывает: стаж и договорённости. */
  const crew = [];
  for (const person of CREW) {
    crew.push(await addStaff({ tenantId: tenant.id, ...person }));
  }

  /* Смена у каждого: без неё запись не проходит — и это правильно,
     машина вне смены не попадает в сдачу наличных. */
  for (const person of crew) {
    await openShift(tenant.id, person.id, startOfDay(tenant.timezone));
  }

  let revenue = 0;
  let payroll = 0;

  for (const [i, person] of crew.entries()) {
    for (const car of WORK[i]) {
      const service = byName.get(car.service)!;
      const made = await createOrder({
        tenantId: tenant.id,
        staffId: person.id,
        serviceId: service.id,
        clientKey: car.plate,
        payment: car.pay,
        tier: car.tier,
        clientRef: `seed-${person.id}-${car.plate}`,
      });
      revenue += made.order.price;
      payroll += Math.floor((made.order.price * made.order.staffPercent) / 100);

      const expect = priceForTier(service, tierIndexOf(withTiers, car.tier));
      if (made.order.price !== expect) {
        throw new Error(`цена по классу разошлась: ${made.order.price} вместо ${expect}`);
      }
    }
  }

  /* Аренда — постоянный расход: платится раз в месяц, а стоит бизнесу
     каждый день, и в прибыли за сегодня видна своей суточной долей. */
  await addExpense({
    tenantId: tenant.id,
    userId: owner.id,
    amount: 200_000,
    category: 'Վարձ',
    monthly: true,
  });

  console.log('');
  console.log('  ' + tenant.name);
  console.log('  ' + '─'.repeat(46));
  console.log(`  владелец   ${OWNER_PHONE}   пароль ${OWNER_PASSWORD}`);
  for (const [i, person] of crew.entries()) {
    console.log(`  ${CREW[i].name.padEnd(9)}  ${CREW[i].phone}   пароль ${CREW[i].password}   ${person.percent}%`);
  }
  console.log('  ' + '─'.repeat(46));
  console.log(`  классы     ${TIERS.join(' · ')}`);
  console.log(`  услуг      ${price.length}`);
  console.log(`  машин      6 (по две на каждого)`);
  console.log(`  выручка    ${formatMoney(revenue, tenant.currency)}`);
  console.log(`  зарплата   ${formatMoney(payroll, tenant.currency)}`);
  console.log(`  аренда     ${formatMoney(200_000, tenant.currency)} в месяц`);
  console.log('');

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
