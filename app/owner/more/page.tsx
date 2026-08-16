import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  CarFront,
  ChevronRight,
  Download,
  FileChartColumn,
  ReceiptText,
  SlidersHorizontal,
  Tags,
  TicketCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { passesEnabled } from '@/lib/features';
import { PageHead } from '@/components/page-head';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull } from '@/lib/i18n/terms';

/**
 * Карта разделов — то, что не поместилось в четыре вкладки.
 *
 * На компьютере этой страницы не нужно: там все девять разделов стоят
 * слева и видны всегда. На телефоне списка нет, а разделов по-прежнему
 * девять, и где-то они обязаны лежать целиком — иначе половина продукта
 * доступна только по прямой ссылке.
 *
 * Экран не список из девяти одинаковых строк. Размер здесь задаёт
 * приоритет, ровно как в приложении: рабочие сущности бизнеса стоят
 * плитками по две в ряд, а обслуживание продукта — филиалы, настройки,
 * моя страница, выгрузка — тихими строками под ними. Зарплат в плитках
 * нет намеренно: они уже вкладка внизу, и второй вход в них означал бы,
 * что человек ищет их в двух местах и в одном не находит.
 *
 * Заходить сюда можно и с компьютера — адрес рабочий, — поэтому мера
 * страницы у́же общей меры кабинета: шесть плиток, растянутых на тысячу
 * триста точек, читались бы баннерами, а не разделами.
 */

type Tone = 'violet' | 'teal' | 'amber' | 'lime';

export default async function MorePage() {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const [raw, me] = await Promise.all([getTenant(session.tid), getUser(session.tid, session.uid)]);
  const tenant = localizeTenantOrNull(raw, t.locale);
  if (!tenant || !me) redirect('/session-ended');

  const points = me.accountId ? await listPoints(me.accountId) : [];

  /* Плитки — сущности бизнеса: кто платит, за что, куда уходит, кто
     делает и что из этого вышло. Тон берётся из свечения приборов табло,
     а не из нового набора цветов: продукт уже знает, что фиолетовый это
     приход, янтарный расход, бирюзовый люди, лайм итог. */
  const tiles: { href: string; name: string; note: string; icon: ReactNode; tone: Tone }[] = [
    {
      href: '/owner/clients',
      name: t.owner.tabClients,
      note: t.phone.clientsLead,
      icon: <CarFront className="size-4" aria-hidden />,
      tone: 'violet',
    },
    {
      href: '/owner/services',
      name: t.settings.tabServices,
      note: t.phone.servicesLead,
      icon: <Tags className="size-4" aria-hidden />,
      tone: 'violet',
    },
    {
      href: '/owner/expenses',
      name: t.expenses.title,
      note: t.phone.expensesLead,
      icon: <ReceiptText className="size-4" aria-hidden />,
      tone: 'amber',
    },
    {
      href: '/owner/staff',
      name: t.phone.team,
      note: t.phone.teamLead,
      icon: <Users className="size-4" aria-hidden />,
      tone: 'teal',
    },
    {
      href: '/owner/reports',
      name: t.reports.title,
      note: t.phone.reportsLead,
      icon: <FileChartColumn className="size-4" aria-hidden />,
      tone: 'lime',
    },
  ];

  if (passesEnabled()) {
    tiles.push({
      href: '/owner/passes',
      name: t.passes.title,
      note: t.phone.passesLead,
      icon: <TicketCheck className="size-4" aria-hidden />,
      tone: 'teal',
    });
  }

  return (
    /* Мера у́же общей меры кабинета, и заметно у́же.
       Экран собран под телефон: шесть плиток, растянутые на тысячу
       двести точек, читаются баннерами, а не разделами. Адрес при этом
       рабочий на любом экране, и выглядеть он должен собранным. */
    <div className="mx-auto w-full max-w-[46rem]">
      <PageHead title={t.phone.moreTitle} meta={t.phone.moreLead} />

      <div className="more-grid">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="more-tile">
            <span className="tone-mark" data-tone={tile.tone}>
              {tile.icon}
            </span>
            <span className="more-tile-name">{tile.name}</span>
            <span className="more-tile-note">{tile.note}</span>
          </Link>
        ))}
      </div>

      {/* Обслуживание продукта — строками и тише плиток: это не сущности
          бизнеса, а то, что трогают раз в год. Волосяные линии между
          строками рисует `.rows`, тот же класс, что в настройках. */}
      <div className="rows mt-[var(--seam)]">
        {/* Филиалы видит только тот, у кого их больше одного: остальные
            не должны узнать, что вторые бывают. */}
        {points.length > 1 && (
          <Link href="/owner/points" className="more-row">
            <span className="tone-mark" data-tone="teal">
              <Building2 className="size-4" aria-hidden />
            </span>
            <span className="more-row-name">
              {t.points.title}
              <span className="more-row-note">{points.length}</span>
            </span>
            <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--board-muted)' }} aria-hidden />
          </Link>
        )}

        <Link href="/owner/settings" className="more-row">
          <span className="tone-mark" data-tone="violet">
            <SlidersHorizontal className="size-4" aria-hidden />
          </span>
          <span className="more-row-name">
            {t.owner.tabSettings}
            <span className="more-row-note">{t.phone.settingsLead}</span>
          </span>
          <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--board-muted)' }} aria-hidden />
        </Link>

        {/* Моя страница — вход к языку, теме, PIN и выходу из кабинета.
            На компьютере они живут внизу боковой колонки; на телефоне
            колонки нет, и это единственная дверь к ним. */}
        <Link href="/owner/profile" className="more-row">
          <span className="tone-mark" data-tone="teal">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span className="more-row-name">
            {t.profile.title}
            <span className="more-row-note">{t.phone.profileLead}</span>
          </span>
          <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--board-muted)' }} aria-hidden />
        </Link>

        {/* Выгрузка приходит файлом и дальше принадлежит человеку:
            отправить себе в почту, положить в «Файлы», открыть в Excel.
            Не раздел, поэтому обычная ссылка на файл, а не строка со
            стрелкой перехода. */}
        <a href="/owner/export" className="more-row" download>
          <span className="tone-mark" data-tone="amber">
            <Download className="size-4" aria-hidden />
          </span>
          <span className="more-row-name">
            {t.settings.export}
            <span className="more-row-note">{t.phone.exportLead}</span>
          </span>
        </a>
      </div>
    </div>
  );
}
