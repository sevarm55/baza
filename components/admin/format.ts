import type { Access } from '@/lib/subscription';
import type { StatusTone } from '@/components/patterns/status-badge';

/**
 * Мелочи админки: тон состояния подписки и даты без Intl, которые не
 * расходятся между сервером и браузером.
 */
export const STATE_TONE: Record<Access['state'], StatusTone> = {
  active: 'success',
  trial: 'brand',
  expired: 'danger',
  blocked: 'neutral',
  unpaid: 'warning',
};

const p = (n: number) => String(n).padStart(2, '0');

/** 05.08.2026 */
export function date(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`;
}

/** 05.08.2026 14:32 */
export function when(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${date(x)} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** 05.08 14:32: для лент, где год лишний */
export function whenShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${p(x.getDate())}.${p(x.getMonth() + 1)} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** Сколько дней назад: 0 сегодня. */
export function daysAgo(d: Date | string | null | undefined, now = Date.now()): number | null {
  if (!d) return null;
  const x = typeof d === 'string' ? new Date(d) : d;
  return Math.floor((now - x.getTime()) / 86_400_000);
}
