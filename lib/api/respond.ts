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
  | 'SERVICE_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  | 'PASS_REQUIRED'
  | 'PASS_UNAVAILABLE'
  | 'ORDER_NOT_FOUND'
  | 'PHONE_TAKEN'
  | 'INTERNAL';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status });
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
    const status = code === 'PASS_UNAVAILABLE' || code === 'PASS_REQUIRED' ? 409 : 404;
    return fail(code, code === 'EMPTY_CLIENT_KEY' ? 400 : status);
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
