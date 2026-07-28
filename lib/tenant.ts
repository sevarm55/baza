import { db } from './db';
import { tenants, users, services } from './db/schema';
import { getNiche, type NicheKey } from './niches';
import { hashPin } from './pin';
import { normalizePhone } from './phone';
import { eq } from 'drizzle-orm';

import { TRIAL_DAYS } from './plan';

export type CreateBusinessInput = {
  niche: NicheKey;
  businessName: string;
  ownerName: string;
  phone: string;
  pin: string;
};

export class PhoneTakenError extends Error {
  constructor() {
    super('PHONE_TAKEN');
  }
}

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

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (existing.length) throw new PhoneTakenError();

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

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
        phone,
        pinHash: await hashPin(input.pin),
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

    return { tenant, owner };
  });
}
