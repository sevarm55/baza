import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { Logo } from '@/components/logo';
import { SideNav } from '@/components/side-nav';
import { PointSwitcher } from '@/components/point-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Point } from '@/lib/accounts';

/**
 * Боковая колонка кабинета — то, что делает веб рабочим местом.
 *
 * Всё постоянное собрано здесь: марка, точка, разделы, роль, выход.
 * Шапка поверх страницы больше не нужна — она отнимала верхнюю полосу
 * экрана у показания, ради которого кабинет открывают, и повторяла то,
 * что и так стоит слева.
 *
 * Колонка не прокручивается вместе со страницей: разделы должны быть
 * под курсором и на сороковой машине в ленте.
 */
export function Rail({
  tenantName,
  userName,
  points,
  currentTid,
  passes,
  active,
}: {
  tenantName: string;
  userName: string;
  points?: Point[];
  currentTid?: string;
  passes: boolean;
  /** где мы сейчас: в кабинете или на экране записи */
  active: 'owner' | 'work';
}) {
  // у кого одна мойка, тот не должен узнать, что бывают вторые
  const many = !!points && points.length > 1 && !!currentTid;

  return (
    <aside className="rail">
      <div className="px-1.5 pb-4">
        <Link href="/owner" aria-label={hy.app.name}>
          <Logo size={26} />
        </Link>
      </div>

      {/* Куда вошли. Название точки крупнее имени: за день оно меняется
          чаще, чем человек за экраном. */}
      <div className="mb-3 px-1.5">
        {many ? (
          <PointSwitcher points={points!} currentId={currentTid!} subtitle={userName} />
        ) : (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{tenantName}</div>
            <div className="truncate text-[12px]" style={{ color: 'var(--board-muted)' }}>
              {userName}
            </div>
          </div>
        )}
      </div>

      <SideNav passes={passes} />

      {/* Всё, что жмут раз в день, — внизу, под растяжкой: сверху живут
          разделы, и они не должны прыгать от появления плашки. */}
      <div className="mt-auto pt-4">
        {/* Своё — отдельно от рабочего: имя, PIN, срок. Восьмым разделом
            наверху этому не место, там живёт то, куда ходят каждый день. */}
        <Link href="/owner/profile" className="nav-item mb-2">
          <span className="nav-mark" aria-hidden>
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="6" r="2.25" />
              <path d="M3.5 13c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5" />
            </svg>
          </span>
          <span className="truncate">{hy.profile.title}</span>
        </Link>

        {/* Владелец на маленькой мойке моет и сам, поэтому переключение
            между кабинетом и записью стоит рядом с выходом, а не среди
            разделов: это не раздел, а вторая половина продукта. */}
        {/* Жёлоб во всю ширину рейки и с воздухом внутри.
        
            Был на три пикселя поля и текст в тринадцать — переключатель
            выходил мелкой белой таблеткой в углу, зажатой между разделами
            и кнопкой выхода. Это не «мелочь внизу»: владелец, который сам
            моет машины, ходит туда-сюда десять раз за смену. */}
        <nav
          className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] p-1"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 8%, transparent)' }}
        >
          {(
            [
              { href: '/work', key: 'work', label: hy.roles.staff },
              { href: '/owner', key: 'owner', label: hy.roles.owner },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active === tab.key ? 'page' : undefined}
              className="truncate rounded-[7px] px-2 py-2 text-center text-[13.5px] transition-colors"
              style={
                active === tab.key
                  ? { background: 'var(--on-board)', color: 'var(--board)', fontWeight: 600 }
                  : { color: 'var(--board-muted)' }
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 px-0.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
