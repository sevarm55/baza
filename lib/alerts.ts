import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { alertSnoozes, clients, payouts } from '@/lib/db/schema';
import { getUnsettledPayroll } from '@/lib/queries';
import { hy } from '@/lib/i18n/hy';

/** Через сколько дней молчания клиент считается потерянным. */
export const LOST_AFTER_DAYS = 21;

/** Через сколько дней после последней выплаты зарплата становится поводом. */
const PAYROLL_AFTER_DAYS = 7;

/** На сколько прячется отложенный повод. */
export const SNOOZE_DAYS = 7;

/**
 * Повод для колокольчика.
 *
 * Не «уведомление» в привычном смысле: здесь нет ленты событий и нет
 * «прочитано». Повод — это состояние мойки, которое требует одного
 * конкретного действия и держится, пока действие не сделано. «Пятеро не
 * были три недели» правда, пока они не приедут; отмечать её прочитанной
 * значит врать себе.
 *
 * Поэтому у повода есть только «отложить»: он замолкает на неделю и
 * возвращается, если ничего не изменилось.
 */
export type Alert = {
  /** ключ повода: по нему он и откладывается */
  key: 'lost-clients' | 'payroll-due';
  title: string;
  note: string;
  /** куда ведёт единственное действие */
  href: string;
  action: string;
  /** янтарный — то, что теряет деньги прямо сейчас */
  tone: 'warn' | 'plain';
};

/**
 * Что сегодня требует внимания владельца.
 *
 * Считается на месте, при отрисовке страницы: пушей и вебсокетов здесь
 * нет и не нужно — мойка не биржа, а лишний канал это лишняя поломка.
 * Все три запроса лёгкие и идут по тем же индексам, что и страницы,
 * которые их уже показывают.
 *
 * Поводов нарочно мало. Колокольчик, в который сыплется всё подряд,
 * перестают открывать на третий день, и тогда он не показывает даже то
 * единственное, ради чего заводился.
 *
 * Забытой смены здесь нет намеренно. Продукт закрывает её сам, при
 * первом же обращении к списку смен, — а повод, который чинится без
 * человека, это и есть шум: он загорается и гаснет, пока владелец
 * решает, стоит ли на него смотреть.
 */
export async function getAlerts(tenantId: string, userId: string): Promise<Alert[]> {
  const now = new Date();

  const [snoozed, lost, payroll, lastPayout] = await Promise.all([
    db
      .select({ key: alertSnoozes.key })
      .from(alertSnoozes)
      .where(and(eq(alertSnoozes.userId, userId), gt(alertSnoozes.until, now))),

    /* Порог считается здесь, а не в SQL-строке: интервал, вклеенный в
       запрос через `sql.raw`, — это склейка текста, и параметром он уже
       не является. Число в него приходит из константы, но привычка
       склеивать запросы руками начинается именно с таких мест. */
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, tenantId),
          gt(clients.visits, 0),
          lt(clients.lastSeenAt, new Date(now.getTime() - LOST_AFTER_DAYS * 86_400_000)),
        ),
      ),

    getUnsettledPayroll(tenantId),

    db
      .select({ paidAt: payouts.paidAt })
      .from(payouts)
      .where(eq(payouts.tenantId, tenantId))
      .orderBy(desc(payouts.paidAt))
      .limit(1),
  ]);

  const quiet = new Set(snoozed.map((s) => s.key));
  const out: Alert[] = [];

  const lostCount = lost[0]?.count ?? 0;
  if (lostCount > 0 && !quiet.has('lost-clients')) {
    out.push({
      key: 'lost-clients',
      title: hy.alerts.lostTitle(lostCount),
      note: hy.alerts.lostNote(LOST_AFTER_DAYS),
      href: '/owner/clients?group=lost',
      action: hy.alerts.lostAction,
      tone: 'warn',
    });
  }

  /* Зарплата становится поводом не от суммы, а от срока: у одной мойки
     сорок тысяч за неделю — обычное дело, у другой это месяц работы.
     Срок одинаков для всех, сумма — нет. */
  const due = payroll.reduce((sum, r) => sum + r.earned, 0);
  const since = lastPayout[0]?.paidAt ?? null;
  const daysSincePayout = since
    ? Math.floor((now.getTime() - since.getTime()) / 86_400_000)
    : PAYROLL_AFTER_DAYS;

  if (due > 0 && daysSincePayout >= PAYROLL_AFTER_DAYS && !quiet.has('payroll-due')) {
    out.push({
      key: 'payroll-due',
      title: hy.alerts.payrollTitle,
      note: hy.alerts.payrollNote(daysSincePayout),
      href: '/owner/payroll',
      action: hy.alerts.payrollAction,
      tone: 'plain',
    });
  }

  return out;
}
