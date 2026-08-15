/**
 * Пересчёт цифр кабинета вручную, прямо по базе.
 *
 * Нужен ровно тогда, когда на экране число, и непонятно, верное оно
 * или нет. Смотреть на экран бесполезно: там уже результат. Здесь тот
 * же результат считается вторым способом — голым SQL, без слоя
 * запросов продукта, — и если два способа сходятся, число верное.
 *
 * Запуск: npx tsx scripts/audit-numbers.ts
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  /* Drizzle возвращает результат по-разному в зависимости от драйвера:
     где-то это массив, где-то объект с `rows`. Скрипту нужен один вид. */
  const rows = async (q: any) => {
    const r: any = await db.execute(q);
    return (r.rows ?? r) as any[];
  };

  const tenants = await rows(
    sql`select id, name, timezone, currency from tenants order by created_at`,
  );

  for (const t of tenants) {
    console.log(`\n${'═'.repeat(60)}\n${t.name}   (${t.timezone})`);

    /* ---------- сегодня ---------- */
    const today = await rows(sql`
      select count(*)::int as cars,
             coalesce(sum(price), 0)::int as revenue,
             coalesce(sum(price) filter (where payment = 'cash'), 0)::int as cash
      from orders
      where tenant_id = ${t.id}
        and canceled_at is null
        and created_at >= date_trunc('day', now() at time zone ${t.timezone}) at time zone ${t.timezone}
    `);
    const d = today[0];
    console.log(`\nСЕГОДНЯ`);
    console.log(`  машин            ${d.cars}`);
    console.log(`  выручка          ${d.revenue}`);
    console.log(`  наличные         ${d.cash}`);
    console.log(`  средний чек      ${d.cars ? Math.round(d.revenue / d.cars) : 0}`);

    /* Доля работника считается по снимку процента В МОМЕНТ записи, а не
       по текущему. Иначе смена процента задним числом переписала бы уже
       выплаченные зарплаты.

       Округление — вниз, `floor`, как в `lib/money.ts` и во всех запросах
       продукта. Здесь стояло `round`, и это делало скрипт бесполезным
       ровно там, ради чего он написан: 999 ֏ под 33 % дают 329 в продукте
       и 330 здесь. На круглых ценах демо-базы расхождения не видно, а на
       живой мойке скидки и нечётные проценты — обычное дело, и «второе
       мнение» начинало спорить с правильным ответом. Проверка обязана
       считать по тому же правилу, иначе она проверяет не продукт, а
       разницу двух способов округления. */
    const payrollToday = await rows(sql`
      select coalesce(sum(floor(price * staff_percent / 100.0)), 0)::int as payroll
      from orders
      where tenant_id = ${t.id}
        and canceled_at is null
        and created_at >= date_trunc('day', now() at time zone ${t.timezone}) at time zone ${t.timezone}
    `);
    console.log(`  зарплата за день ${payrollToday[0].payroll}`);

    /* ---------- зарплата: кому сколько должны ---------- */
    console.log(`\nЗАРПЛАТА (с последней выплаты)`);
    const staff = await rows(sql`
      select u.id, u.name, u.percent, u.role,
             (select max(p.period_to) from payouts p where p.staff_id = u.id) as last_paid
      from users u
      where u.tenant_id = ${t.id} and u.active = true
      order by u.name
    `);

    for (const s of staff) {
      const since = await rows(sql`
        select count(*)::int as cars,
               coalesce(sum(price), 0)::int as revenue,
               coalesce(sum(floor(price * staff_percent / 100.0)), 0)::int as owed,
               min(staff_percent)::int as min_pct,
               max(staff_percent)::int as max_pct
        from orders
        where tenant_id = ${t.id}
          and staff_id = ${s.id}
          and canceled_at is null
          ${s.last_paid ? sql`and created_at > ${s.last_paid}` : sql``}
      `);
      const x = since[0];
      const naive = Math.round((x.revenue * s.percent) / 100);
      console.log(`  ${s.name} (${s.role}, сейчас ${s.percent}%)`);
      console.log(`    последняя выплата   ${s.last_paid ?? '— не было —'}`);
      console.log(`    машин с тех пор     ${x.cars}`);
      console.log(`    выручка с тех пор   ${x.revenue}`);
      console.log(`    ДОЛЖНЫ (по снимкам) ${x.owed}`);
      console.log(`    если бы по текущему ${naive}   ${x.owed === naive ? '' : '← РАСХОДИТСЯ'}`);
      console.log(`    проценты в записях  от ${x.min_pct ?? '—'} до ${x.max_pct ?? '—'}`);

      /* Если процент за историю менялся, разбивка объясняет, откуда
         взялась сумма: без неё «20% от 130 500 = 600» выглядит ошибкой
         расчёта, хотя это снимки старых записей. */
      if (x.min_pct !== x.max_pct) {
        const byPct = await rows(sql`
          select staff_percent::int as pct,
                 count(*)::int as cars,
                 sum(price)::int as revenue,
                 sum(floor(price * staff_percent / 100.0))::int as owed
          from orders
          where tenant_id = ${t.id} and staff_id = ${s.id} and canceled_at is null
            ${s.last_paid ? sql`and created_at > ${s.last_paid}` : sql``}
          group by 1 order by 1
        `);
        console.log(`    ── по ставкам:`);
        for (const b of byPct) {
          console.log(`       ${String(b.pct).padStart(3)}%  ${String(b.cars).padStart(3)} маш  ${String(b.revenue).padStart(8)} ֏  →  ${b.owed} ֏`);
        }
      }
    }

    /* ---------- выплаты ---------- */
    const payouts = await rows(sql`
      select p.amount, p.period_from, p.period_to, u.name
      from payouts p join users u on u.id = p.staff_id
      where p.tenant_id = ${t.id}
      order by p.period_to desc limit 5
    `);
    if (payouts.length) {
      console.log(`\nПОСЛЕДНИЕ ВЫПЛАТЫ`);
      for (const p of payouts) {
        console.log(`  ${p.name}  ${p.amount}  ${new Date(p.period_to).toISOString().slice(0, 16)}`);
      }
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
