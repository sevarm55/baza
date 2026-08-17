import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { sessions } from './db/schema';
import { logSecurity } from './security-log';

/**
 * Устройства, с которых сейчас есть вход.
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ. Телефон на мойке общий и переходит из рук в руки, а
 * пара токенов живёт тридцать дней. До этого списка погасить чужой вход
 * можно было только сменой PIN — то есть вылетев самому и заодно
 * выкинув себя со всех своих устройств. Наказание за потерянный телефон
 * получалось больше самой потери, и им не пользовались.
 *
 * Список СВОЙ, а не всего бизнеса. Владелец не должен видеть здесь
 * сессии сотрудников: уволить человека он и так может — это отключает
 * участие и гасит его входы разом (`deactivateStaff`), — а разглядывать
 * его устройства оснований нет.
 *
 * Живёт отдельным модулем, потому что читают его двое: кабинет через
 * серверное действие и приложение через `/api/v1/auth/devices`. Веб на
 * cookie, приложение на токене, а вопрос у них один и тот же — и ответ
 * обязан быть один.
 */

export type Device = {
  id: string;
  /** web | app — чем человек вошёл */
  kind: string;
  /** метка устройства, как её назвал клиент: «iPhone Сево», «Safari, macOS» */
  device: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  /** это устройство, с которого смотрят прямо сейчас */
  current: boolean;
};

/**
 * Что показывать в списке.
 *
 * `userId` здесь — участие, а не человек: сессия выдаётся на точку, и
 * токен подписан именно ею. У кого две мойки, тот видит входы той, в
 * которой находится, и это верно — гасить чужую точку из этой было бы
 * действием через границу, которую сам продукт держит везде.
 */
export async function listDevices(userId: string, currentSid?: string | null): Promise<Device[]> {
  const rows = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      device: sessions.device,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt));

  return rows.map((r) => ({ ...r, current: r.id === currentSid }));
}

/**
 * Погасить вход.
 *
 * Гасить можно только своё: id сессии — угадываемый uuid, и без проверки
 * владельца любой вошедший выкидывал бы кого угодно. Условие стоит
 * прямо в UPDATE, а не проверкой перед ним: между SELECT и UPDATE
 * помещается второй такой же запрос.
 *
 * `refreshHash` затирается вместе с отметкой: без этого на руках у того,
 * кого выгнали, остаётся действующий refresh, и он обменял бы его на
 * новую пару раньше, чем сессию проверят.
 */
export async function revokeDevice(input: {
  userId: string;
  sessionId: string;
  /** для журнала: чей это бизнес и кто гасит */
  tenantId?: string;
  phone?: string;
  ip?: string | null;
}): Promise<boolean> {
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date(), refreshHash: null })
    .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
    .returning({ id: sessions.id, kind: sessions.kind });

  if (!row) return false;

  /* Событие безопасности, а не строка в справочнике: человек только что
     закрыл кому-то доступ к деньгам бизнеса, и если это был не он,
     запись останется. */
  await logSecurity({
    event: 'auth.session.revoked',
    phone: input.phone,
    ip: input.ip ?? null,
    tenantId: input.tenantId,
    userId: input.userId,
    data: { sessionId: row.id, kind: row.kind },
  });

  return true;
}
