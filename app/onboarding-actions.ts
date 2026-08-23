'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';

/**
 * Приветствие первого входа работника — единственное, что осталось от
 * прежнего онбординга поверх продукта. Владельца теперь встречает
 * сценарий первого запуска (app/onboarding), у которого своё состояние
 * и свои действия; «Начало работы» с главной и его флаги ушли вместе с
 * ним. Мобильное приложение пишет те же даты своим маршрутом
 * (/api/v1/setup) и этим файлом не пользуется.
 *
 * Действие не обязательно: продукт работает и без него. Поэтому отказ
 * базы переживается молча — интерфейс уже закрыл окно на месте, и
 * ронять экран из-за незаписанной даты приветствия было бы худшим из
 * ответов.
 */

/** Отметить приветствие прочитанным. Показывается один раз навсегда. */
export async function markWelcomeSeen(): Promise<void> {
  const session = await requireSession();
  await ensureDb();

  try {
    await db
      .update(users)
      .set({ welcomeSeenAt: new Date() })
      .where(and(eq(users.id, session.uid), eq(users.tenantId, session.tid)));
  } catch {
    /* см. заметку в шапке файла */
  }
}
