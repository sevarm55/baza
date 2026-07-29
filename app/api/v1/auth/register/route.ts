import { ensureDb } from '@/lib/db/ready';
import { createBusiness, PhoneTakenError } from '@/lib/tenant';
import { isNicheAvailable, type NicheKey } from '@/lib/niches';
import { isValidPhone, isValidPin, normalizePhone } from '@/lib/phone';
import { clientIp, noteLogin } from '@/lib/login-guard';
import { issueForDevice } from '@/lib/api/tokens';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Регистрация бизнеса из приложения.
 *
 * Раньше её не было, и это было ошибкой: человек, скачавший приложение из
 * App Store, упирался в экран входа без возможности создать аккаунт. Такое
 * приложение отклоняют на ревью — и справедливо, это тупик. А владелец
 * мойки в Армении вполне может не иметь компьютера вовсе.
 *
 * Ниша проверяется здесь, а не только в интерфейсе: эндпоинт открыт
 * наружу, и выключенную нишу нельзя дать завести прямым запросом.
 *
 * Логика создания — та же createBusiness, что у веба. Именно она копирует
 * термины ниши в поля тенанта и засевает прайс; двух копий такого быть
 * не должно.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      niche?: string;
      businessName?: string;
      ownerName?: string;
      phone?: string;
      pin?: string;
      device?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const niche = str(input.niche);
    const businessName = str(input.businessName);
    const ownerName = str(input.ownerName);
    const phone = normalizePhone(str(input.phone));
    const pin = str(input.pin);

    if (!isNicheAvailable(niche)) return fail('BAD_REQUEST', 400, { reason: 'NICHE' });
    if (businessName.length < 2 || ownerName.length < 2) {
      return fail('BAD_REQUEST', 400, { reason: 'NAME' });
    }
    if (!isValidPhone(phone)) return fail('BAD_REQUEST', 400, { reason: 'PHONE' });
    if (!isValidPin(pin)) return fail('BAD_REQUEST', 400, { reason: 'PIN' });

    const { tenant, owner } = await createBusiness({
      niche: niche as NicheKey,
      businessName,
      ownerName,
      phone,
      pin,
    });

    /* Регистрация — это и вход тоже: заставлять человека сразу после
       создания бизнеса вводить те же телефон и PIN снова незачем.
       Отмечаем удачный вход, чтобы счётчик попыток не считал новичка
       подозрительным. */
    await noteLogin(phone, clientIp(request.headers), true);

    const issued = await issueForDevice({
      tenantId: tenant.id,
      userId: owner.id,
      role: 'owner',
      device: str(input.device) || null,
    });

    return ok(
      {
        access: issued.access,
        refresh: issued.refresh,
        expiresIn: issued.expiresIn,
        user: { id: owner.id, name: owner.name, role: 'owner', percent: owner.percent },
      },
      201,
    );
  } catch (e) {
    if (e instanceof PhoneTakenError) return fail('PHONE_TAKEN', 409);
    return failFromError(e);
  }
}
