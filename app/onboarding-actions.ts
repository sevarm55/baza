'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';

/**
 * Начало работы — три действия, и все три про одно: что человек с этим
 * блоком сделал.
 *
 * Отдельным файлом от `app/actions.ts` не по размеру, а по смыслу: там
 * действия правят бизнес — услуги, людей, деньги, — а здесь ни одно
 * ничего в бизнесе не меняет. Онбординг это слой поверх продукта, и
 * граница между ними должна быть видна в дереве файлов.
 *
 * Ни одно из действий не обязательно: продукт работает и без них.
 * Поэтому все три молча переживают отказ базы — интерфейс уже закрыл
 * окно на месте, и второй раз он его не покажет до перезагрузки; а
 * ронять экран владельца из-за того, что не записалась дата
 * приветствия, было бы худшим из ответов.
 */

/** Отметить приветствие прочитанным. Показывается один раз навсегда. */
export async function markWelcomeSeen(): Promise<void> {
  await stamp('welcomeSeenAt', new Date());
}

/**
 * Убрать «Начало работы» с главной.
 *
 * И пропуск, и «Готово» в конце — одно и то же действие: человек
 * сказал, что блок ему больше не нужен. Разницу между «пропустил» и
 * «закончил» продукт и так видит по данным бизнеса, отдельного слова
 * для неё не нужно.
 */
export async function hideSetup(): Promise<void> {
  await stamp('setupHiddenAt', new Date());
  revalidatePath('/owner', 'layout');
}

/** Вернуть настройку на главную — из своей страницы. */
export async function resumeSetup(): Promise<void> {
  await stamp('setupHiddenAt', null);
  revalidatePath('/owner', 'layout');
}

/**
 * Проставить дату на участии того, кто вошёл.
 *
 * Именно на участии, а не на человеке: приветствие у владельца и у
 * мойщика разное, и вторая точка того же владельца — второй бизнес,
 * который тоже надо настроить.
 */
async function stamp(field: 'welcomeSeenAt' | 'setupHiddenAt', value: Date | null): Promise<void> {
  const session = await requireSession();
  await ensureDb();

  try {
    await db
      .update(users)
      .set({ [field]: value })
      .where(and(eq(users.id, session.uid), eq(users.tenantId, session.tid)));
  } catch {
    /* см. заметку в шапке файла: онбординг не повод ронять кабинет */
  }
}
