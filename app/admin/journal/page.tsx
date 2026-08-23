import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { adminJournal } from '@/lib/admin-audit';
import { formatMoney } from '@/lib/money';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { when } from '../format';

/**
 * Что мы делали с чужими бизнесами.
 *
 * Пока админ один, лента читается как дневник. Смысл появляется на
 * втором человеке и в разговоре с клиентом: продление, отключение и
 * заход в чужие цифры перестают быть словом против слова.
 */
const LABEL: Record<string, string> = {
  tenant_view: 'смотрел карточку',
  subscription_extend: 'продлил',
  tenant_block: 'отключил',
  tenant_unblock: 'включил обратно',
  tenant_note: 'изменил заметку',
};

const head = 'h-9 px-4 text-xs text-muted-foreground';
const cell = 'px-4 py-2.5';

export default async function JournalPage() {
  await ensureDb();

  const rows = await adminJournal();

  return (
    <>
      <PageHeader
        className="mb-0"
        title="Журнал"
        description="Наши действия с чужими бизнесами"
      />

      {rows.length === 0 ? (
        <EmptyState title="Пока ничего не делали" />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={head}>Когда</TableHead>
                <TableHead className={head}>Кто</TableHead>
                <TableHead className={head}>Что</TableHead>
                <TableHead className={head}>Бизнес</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={`${cell} num text-muted-foreground`}>{when(r.at)}</TableCell>
                  <TableCell className={`${cell} font-medium`}>{r.adminName ?? 'кто-то'}</TableCell>
                  <TableCell className={`${cell} num`}>
                    {LABEL[r.action] ?? r.action}
                    {detail(r.action, r.data)}
                  </TableCell>
                  <TableCell className={`${cell} font-semibold`}>
                    <Link
                      href={`/admin/t/${r.tenantId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {r.tenantName}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </>
  );
}

/** У продления в аудите лежат месяцы и сумма: без них строка бессодержательна. */
function detail(action: string, data: unknown): string {
  if (action !== 'subscription_extend') return '';
  const d = data as { months?: number; amount?: number } | null;
  if (!d?.months) return '';
  const amount = typeof d.amount === 'number' ? ` за ${formatMoney(d.amount, 'AMD')}` : '';
  return ` · ${d.months} мес${amount}`;
}
