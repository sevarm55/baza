import { eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, tenants, users, services, type Account } from './db/schema';
import { FIRST_RUN_START } from './first-run-stage';
import { getNiche, type NicheKey } from './niches';
import { notifyPlatformInBackground } from './push';
import { normalizePhone } from './phone';
import { claimAccount } from './accounts';

import { TRIAL_DAYS } from './plan';

export type CreateBusinessInput = {
  niche: NicheKey;
  businessName: string;
  ownerName: string;
  /**
   * Кто заводит. Либо номер с кодом — так приходит регистрация снаружи,
   * либо уже опознанный человек — так приходит вторая точка из кабинета,
   * где спрашивать код второй раз незачем.
   */
  phone?: string;
  /** почта владельца: его логин */
  email?: string;
  /**
   * Уже посчитанный хеш пароля.
   *
   * Так приходит регистрация с подтверждением почты: пароль хешируется
   * на первом шаге, до отправки письма, и в заявке между шагами лежит
   * только хеш. Открытому паролю незачем ждать в базе час, пока человек
   * дойдёт до почты.
   */
  passwordHash?: string;
  /** Адрес доказан переходом по ссылке из письма — тогда и только тогда. */
  emailVerified?: boolean;
  accountId?: string;
};

/* Одна ошибка на весь продукт: раньше «номер занят» решалось чтением
   users здесь, а теперь — уникальным индексом на человеке. Класс тот же,
   чтобы `instanceof` у всех вызывающих продолжал работать. */
export { PhoneTakenError } from './accounts';

/**
 * Регистрация бизнеса.
 *
 * Здесь и только здесь конфиг ниши превращается в данные тенанта:
 * термины копируются в поля, услуги — в таблицу. Дальше приложение
 * работает исключительно с БД и про ниши не вспоминает.
 */
export async function createBusiness(input: CreateBusinessInput) {
  const niche = getNiche(input.niche);

  /* Человек заводится первым. Снаружи приходит номер с кодом — тогда
     занятость номера решает уникальный индекс на человеке, а не чтение
     перед вставкой. Из кабинета приходит уже опознанный человек: код у
     него спрашивать второй раз незачем, он только что вошёл. */
  const account = input.accountId
    ? await byId(input.accountId)
    : await claimAccount({
        phone: normalizePhone(input.phone ?? ''),
        email: input.email ?? null,
        passwordHash: input.passwordHash ?? null,
        emailVerified: input.emailVerified,
      });

  /* Пробный срок даётся ЧЕЛОВЕКУ один раз, а не каждой его мойке. Иначе
     шесть бесплатных дней получались бы бесконечно: заведи вторую точку,
     потом третью. Вторая точка заводится сразу платной и до оплаты
     закрыта — см. состояние 'unpaid' в lib/subscription.ts. */
  const trialGranted = account.trialUsedAt === null;
  const trialEndsAt = trialGranted ? new Date(Date.now() + TRIAL_DAYS * 86_400_000) : null;

  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: input.businessName.trim(),
        niche: niche.key,
        clientIdLabel: niche.clientIdLabel,
        clientIdType: niche.clientIdType,
        staffRole: niche.staffRole,
        unitOne: niche.unitOne,
        plan: trialGranted ? 'trial' : 'unpaid',
        trialEndsAt,
      })
      .returning();

    if (trialGranted) {
      /* Факт, а не флаг: дата отвечает и на «давали ли», и на «когда».
         В админке это единственный способ отличить первую точку клиента
         от следующих, не гадая по датам создания бизнесов. */
      await tx
        .update(accounts)
        .set({ trialUsedAt: new Date() })
        .where(eq(accounts.id, account.id));
    }

    const [owner] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        accountId: account.id,
        phone: account.phone,
        name: input.ownerName.trim(),
        role: 'owner',
        percent: 0,
        /* Сценарий первого запуска — только первому бизнесу человека.
           Вторая точка заводится тем, кто цикл продукта уже прошёл:
           вести его по «услуги → работник → первая машина» второй раз
           значило бы учить владельца его собственному делу. */
        onboardingStage: trialGranted ? FIRST_RUN_START : null,
      })
      .returning();

    await tx.insert(services).values(
      niche.services.map((s, i) => ({
        tenantId: tenant.id,
        name: s.name,
        price: s.price,
        sort: i,
      })),
    );

    /* Владельцу платформы — сразу. Человек, который завёл бизнес и не
       начал им пользоваться, отваливается молча и навсегда; звонок в
       первый день решает больше, чем три письма на второй неделе.

       Первая точка и следующая — разные сигналы, и текст разный.
       К новому едут знакомиться, ко второй точке — выставлять счёт: она
       заведена, закрыта и ждёт оплаты прямо сейчас. */
    notifyPlatformInBackground({
      title: trialGranted ? 'Новый бизнес' : 'Вторая точка · ждёт оплаты',
      body: `${tenant.name} · ${owner.name} · ${niche.name}`,
      thread: 'platform',
    });

    return { tenant, owner, trialGranted };
  });
}

/* Человек уже опознан сессией — если его нет, сломалось что-то выше, и
   тихо заводить нового было бы худшим из ответов. */
async function byId(accountId: string): Promise<Account> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!row) throw new Error('NO_ACCOUNT');
  return row;
}
