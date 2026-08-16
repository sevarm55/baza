/**
 * Мойка, которая работает год.
 *
 * Демо-бизнес маленький и на нём всё быстро. Настоящая мойка за год
 * набирает тысячи записей, сотни клиентов и триста смен — и вопросы
 * «открывается ли сводка» и «не начал ли список клиентов грузиться
 * секундами» на демо-данных не проверить вовсе.
 *
 * Запуск:
 *
 *     npm run seed:load              1 000 записей
 *     npm run seed:load -- 10000     столько, сколько попросили
 *
 * Заводит СВОЙ бизнес и чужого не трогает. Телефон печатается в конце —
 * им можно войти и посмотреть глазами.
 *
 * Есть и вторая половина, `--edge`: тот же бизнес, но с данными, на
 * которых ломается вёрстка, — имена во всю строку, эмодзи, нули, суммы
 * в миллионы, пустые необязательные поля.
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

const args = process.argv.slice(2);
const edge = args.includes('--edge');
const COUNT = Number(args.find((a) => /^\d+$/.test(a)) ?? 1000);

/* Детерминированный «случай»: один и тот же сид даёт одну и ту же базу,
   и «вчера было быстро, сегодня медленно» нельзя списать на другие
   данные. */
let seed = 20260815;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function plate(): string {
  return `${between(10, 99)}${pick(LETTERS.split(''))}${pick(LETTERS.split(''))}${between(100, 999)}`;
}

/** Имена, на которых ломается вёрстка. */
const EDGE_NAMES = [
  'Ա',
  'Աաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաաա',
  '🚗🚿💦 Мойка на углу 🚗',
  'Ованес-Григорий Мкртчян-Саркисян',
  '   пробелы вокруг   ',
  'O’Brien «Кавычки» — тире',
];

async function main() {
  const { createBusiness } = await import('../lib/tenant');
  const { createOrder } = await import('../lib/orders');
  const { addExpense } = await import('../lib/expenses');
  const { db } = await import('../lib/db');
  const { users, services, shifts } = await import('../lib/db/schema');
  const { hashPin } = await import('../lib/pin');
  const { listServices } = await import('../lib/queries');
  const { ensureDb } = await import('../lib/db/ready');
  const { sql, eq } = await import('drizzle-orm');

  await ensureDb();

  const stamp = String(Date.now()).slice(-6);
  const { tenant, owner } = await createBusiness({
    niche: 'carwash',
    businessName: edge ? EDGE_NAMES[1] : `Нагрузка ${stamp}`,
    ownerName: edge ? EDGE_NAMES[2] : 'Владелец',
    phone: `077 ${stamp.slice(0, 3)} ${stamp.slice(3)}`,
    pin: '901111',
  });

  /* Люди: активные, уволенный, без единой смены, с длинным именем и с
     крайними ставками. Владелец сам моет — так на маленькой мойке и есть. */
  const crew: { id: string; percent: number }[] = [{ id: owner.id, percent: owner.percent }];
  const PEOPLE = edge
    ? [
        { name: EDGE_NAMES[1], percent: 100 },
        { name: EDGE_NAMES[0], percent: 0 },
        { name: EDGE_NAMES[2], percent: 1 },
        { name: EDGE_NAMES[4], percent: 99 },
      ]
    : [
        { name: 'Աշոտ', percent: 30 },
        { name: 'Դավիթ', percent: 40 },
        { name: 'Կարեն', percent: 50 },
        { name: 'Без смен', percent: 35 },
        { name: 'Уволенный', percent: 45 },
      ];

  for (const [i, p] of PEOPLE.entries()) {
    const [row] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        phone: `+37455${stamp}${i}`,
        pinHash: await hashPin('2222'),
        name: p.name,
        role: 'staff',
        percent: p.percent,
        active: p.name !== 'Уволенный',
      })
      .returning();
    if (p.name !== 'Без смен' && p.name !== 'Уволенный') crew.push({ id: row.id, percent: row.percent });
  }

  const svc = await listServices(tenant.id);
  if (edge) {
    // ноль, единица и миллион — цены, на которых ломается и вёрстка, и доля
    await db.update(services).set({ price: 0 }).where(eq(services.id, svc[0].id));
    await db.update(services).set({ price: 1 }).where(eq(services.id, svc[1].id));
    await db.update(services).set({ price: 1_000_000 }).where(eq(services.id, svc[2].id));
  }

  /* Записи размазаны по году назад: отчёты за месяц, прошлый месяц и
     год должны иметь что показывать. */
  const YEAR = 365 * 86_400_000;
  const now = Date.now();
  const plates = Array.from({ length: Math.max(20, Math.floor(COUNT / 8)) }, plate);

  console.log(`бизнес: ${tenant.name}`);
  console.log(`пишу ${COUNT} записей…`);

  let done = 0;
  for (let i = 0; i < COUNT; i++) {
    const who = pick(crew);
    const at = new Date(now - Math.floor(rnd() * YEAR));
    try {
      const made = await createOrder({
        tenantId: tenant.id,
        staffId: who.id,
        serviceIds: rnd() < 0.2 ? [pick(svc).id, pick(svc).id] : [pick(svc).id],
        clientKey: pick(plates),
        payment: pick(['cash', 'card', 'transfer'] as const),
        clientRef: `load-${stamp}-${i}`,
        note: edge && rnd() < 0.3 ? EDGE_NAMES[1] : undefined,
      });
      // дата записи ставится базой; двигаем её назад, чтобы получился год
      await db.execute(
        sql`update orders set created_at = ${at.toISOString()}::timestamptz where id = ${made.order.id}`,
      );
      done++;
    } catch {
      /* пропущенная запись погоды не делает: их тысячи */
    }
    if (done % 200 === 0 && done > 0) console.log(`  ${done}…`);
  }

  /* Расходы: постоянные и разовые, по всему году. */
  for (let i = 0; i < Math.max(12, Math.floor(COUNT / 40)); i++) {
    await addExpense({
      tenantId: tenant.id,
      userId: owner.id,
      amount: edge && i === 0 ? 1 : between(1000, 400_000),
      category: pick(['Քիմիա', 'Վարձ', 'Հոսանք', 'Ջուր', 'Գույք', edge ? EDGE_NAMES[1] : 'Վերանորոգում']),
      monthly: i % 5 === 0,
      at: new Date(now - Math.floor(rnd() * YEAR)),
    });
  }

  /* Смены: по одной на человека на каждый из последних трёхсот дней. */
  const openRows: { tenantId: string; userId: string; openedAt: Date; closedAt: Date }[] = [];
  for (let d = 1; d <= 300; d++) {
    for (const p of crew) {
      if (rnd() < 0.4) continue;
      const day = new Date(now - d * 86_400_000);
      day.setHours(9, 0, 0, 0);
      const close = new Date(day.getTime() + 10 * 3_600_000);
      openRows.push({ tenantId: tenant.id, userId: p.id, openedAt: day, closedAt: close });
    }
  }
  for (let i = 0; i < openRows.length; i += 500) {
    await db.insert(shifts).values(openRows.slice(i, i + 500));
  }

  console.log('');
  console.log(`готово: ${done} записей, ${openRows.length} смен, ${plates.length} машин`);
  console.log(`вход:  +374 77 ${stamp.slice(0, 3)} ${stamp.slice(3)}  ·  PIN 1111`);
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
