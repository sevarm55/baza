import { NextResponse } from 'next/server';

import { getLiveSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { listActivity, type ActivityGroup } from '@/lib/activity';

/**
 * Лента по запросу: для опроса, когда поток недоступен, и для
 * подгрузки страницы активности вниз.
 *
 * `after` догоняет вперёд, `before` листает назад; оба ISO.
 */
export const dynamic = 'force-dynamic';

const GROUPS: ActivityGroup[] = ['cars', 'shifts', 'money', 'team', 'catalog', 'clients'];

export async function GET(request: Request) {
  const session = await getLiveSession();
  if (!session || session.role !== 'owner') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  await ensureDb();

  const url = new URL(request.url);
  const date = (key: string) => {
    const raw = url.searchParams.get(key);
    return raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  };
  const groups = url.searchParams
    .getAll('group')
    .filter((g): g is ActivityGroup => (GROUPS as string[]).includes(g));
  const actorId = url.searchParams.get('actor') || undefined;
  const limit = Number(url.searchParams.get('limit') ?? 50);

  const rows = await listActivity(session.tid, {
    after: date('after'),
    before: date('before'),
    from: date('from'),
    to: date('to'),
    groups,
    actorId,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
