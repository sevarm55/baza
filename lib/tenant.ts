import { db } from './db';
import { tenants, users, services } from './db/schema';
import { getNiche, type NicheKey } from './niches';
import { hashPin } from './pin';
import { notifyPlatformInBackground } from './push';
import { normalizePhone } from './phone';
import { claimAccount } from './accounts';

import { TRIAL_DAYS } from './plan';

export type CreateBusinessInput = {
  niche: NicheKey;
  businessName: string;
  ownerName: string;
  phone: string;
  pin: string;
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
  const phone = normalizePhone(input.phone);

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  /* Человек заводится первым, и он же решает, свободен ли номер: занятость
     ловится уникальным индексом на телефоне, а не чтением users перед
     вставкой. Чтение здесь было и лишним, и обманчивым — между ним и
     вставкой помещается вторая такая же регистрация. */
  const account = await claimAccount({ phone, pinHash: await hashPin(input.pin) });

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
        trialEndsAt,
      })
      .returning();

    const [owner] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        accountId: account.id,
        phone,
        pinHash: account.pinHash,
        name: input.ownerName.trim(),
        role: 'owner',
        percent: 0,
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
       первый день решает больше, чем три письма на второй неделе. */
    notifyPlatformInBackground({
      title: 'Новый бизнес',
      body: `${tenant.name} · ${owner.name} · ${niche.name}`,
      thread: 'platform',
    });

    return { tenant, owner };
  });
}
