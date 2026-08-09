import { NextResponse } from 'next/server';
import { DuplicateError, NotFoundError } from '../orders';
import { SubscriptionExpiredError } from '../subscription';
import { PhoneTakenError } from '../tenant';

/**
 * Ответы API.
 *
 * Наружу уходит КОД, а не текст. Приложение переводит сам: у него свой
 * словарь и своя локаль, и присылать ему готовую армянскую строку значит
 * навсегда лишить возможности показать её по-другому.
 *
 * Коды не выдуманы заново — это те же строки, которыми уже бросается
 * доменный слой (`lib/orders.ts`, `lib/subscription.ts`).
 */

export type ApiError =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'WRONG_CREDENTIALS'
  | 'TOO_MANY_TRIES'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_BLOCKED'
  | 'EMPTY_CLIENT_KEY'
  | 'BAD_PRICE'
  | 'SERVICE_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  /** записывать можно только на смене — см. lib/shifts.ts */
  | 'SHIFT_REQUIRED'
  | 'PASS_REQUIRED'
  | 'PASS_UNAVAILABLE'
  | 'ORDER_NOT_FOUND'
  | 'PHONE_TAKEN'
  | 'INTERNAL';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

/**
 * Ответ без содержимого.
 *
 * Отдельно от ok(), потому что 204 по спецификации тела иметь не может, и
 * NextResponse.json на нём бросает TypeError — не при сборке, а в бою.
 * Выход из приложения и отмена записи так и падали пятисоткой, пока это
 * не нашлось в логах.
 */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function fail(
  error: ApiError,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Доменные ошибки → коды ответа.
 *
 * Сообщение у NotFoundError и так является кодом — доменный слой писался
 * с этим расчётом, поэтому здесь ничего не переводится, только
 * подбирается статус.
 */
export function failFromError(e: unknown): NextResponse {
  if (e instanceof SubscriptionExpiredError) return fail('SUBSCRIPTION_EXPIRED', 402);
  if (e instanceof PhoneTakenError) return fail('PHONE_TAKEN', 409);

  if (e instanceof DuplicateError) {
    // повторная досылка из очереди — не ошибка клиента, а обычное дело
    return fail('BAD_REQUEST', 409);
  }

  if (e instanceof NotFoundError) {
    const code = e.message as ApiError;
    if (code === 'PASS_UNAVAILABLE' || code === 'PASS_REQUIRED') return fail(code, 409);
    // неверный ввод, а не отсутствующая сущность
    if (code === 'EMPTY_CLIENT_KEY' || code === 'BAD_PRICE') return fail(code, 400);
    return fail(code, 404);
  }

  console.error('api:', e);
  return fail('INTERNAL', 500);
}

/** Разбор тела с понятной ошибкой вместо падения на невалидном JSON. */
export async function body<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Похоже ли на uuid.
 *
 * Проверять обязательно ДО запроса: Postgres на разборе кривого uuid
 * бросает свою ошибку, и наружу вместо честного «не найдено» уходит 500.
 * Клиенту это неотличимо от поломки сервера, а в логи сыплется шум от
 * любого, кто дёрнул адрес руками.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID.test(v);
}
