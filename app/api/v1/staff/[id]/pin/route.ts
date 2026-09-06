import { ensureDb } from '@/lib/db/ready';
import { resetStaffPin, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, isUuid, noContent, str } from '@/lib/api/respond';

/**
 * Выдать сотруднику новый пароль.
 *
 * Отдельный маршрут, а не поле в `PATCH /staff/:id`. Причина не в
 * аккуратности: в PATCH пароль попадал бы туда же, куда имя и процент,
 * то есть в каждый запрос формы правки — и промах клиента переписывал бы
 * человеку пароль заодно с фамилией. Здесь это отдельное намеренное
 * действие, и в журнале оно отдельная строка.
 *
 * Кому нельзя и почему — в `resetStaffPin` (lib/catalog.ts): владельцу
 * так пароль не выдают, и человеку, который работает не только здесь,
 * тоже. Второе важнее первого: назначенный нами пароль открыл бы чужой
 * бизнес.
 *
 * Старый пароль не спрашивается: владелец его и не знает. Правом здесь
 * служит то, что это его бизнес и его сотрудник.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    /* Кривой id до Postgres доводить нельзя: он бросит своё на разборе
       uuid, и наружу вместо «не найдено» уйдёт пятисотка. */
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    /* Два имени одного поля. Путь маршрута остался прежним, и сборки
       до перехода на пароль шлют сюда `pin`: переименовать одно движением
       значило бы сломать выдачу доступа у всех, кто ещё не обновился. */
    const input = await body<{ password?: string; pin?: string }>(request);
    const password = str(input?.password) || str(input?.pin);
    if (!password) return fail('BAD_REQUEST', 400);

    await resetStaffPin({
      tenantId: ctx.tenant.id,
      id,
      actorId: ctx.user.id,
      password,
    });

    return noContent();
  } catch (e) {
    if (e instanceof ValidationError) {
      switch (e.message) {
        case 'NOT_FOUND':
          return fail('NOT_FOUND', 404);
        /* Причина словом, а не общим отказом: короткий пароль и
           слишком очевидный человек чинит по-разному, а форма стоит
           перед ним прямо сейчас. */
        case 'PASSWORD_SHORT':
        case 'PASSWORD_COMMON':
          return fail('BAD_REQUEST', 400, { reason: e.message });
        /* Запрет, а не отсутствие: 403 честнее 404. Человек существует,
           просто код ему так не выдают. */
        case 'CANNOT_RESET_SELF':
        case 'OWNER_KEEPS_OWN_PIN':
        case 'WORKS_ELSEWHERE':
          return fail('FORBIDDEN', 403, { reason: e.message });
        default:
          return fail('BAD_REQUEST', 400, { reason: e.message });
      }
    }
    return failFromError(e);
  }
}
