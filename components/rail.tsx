import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { Logo } from '@/components/logo';
import { SideNav } from '@/components/side-nav';
import { PointSwitcher } from '@/components/point-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import { SwitchMark } from '@/components/switch-mark';
import { RailCollapse } from '@/components/rail-collapse';
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
      {/* Марка и кнопка сворачивания одной строкой: кнопка живёт там,
          где начинается сама колонка, а не внизу среди выхода. */}
      <div className="flex items-center justify-between gap-2 px-1.5 pb-4">
        <Link href="/owner" aria-label={hy.app.name} className="rail-brand">
          <Logo size={26} />
        </Link>
        <RailCollapse labelExpand={hy.common.expand} labelCollapse={hy.common.collapse} />
      </div>

      {/* Куда вошли. Название точки крупнее имени: за день оно меняется
          чаще, чем человек за экраном. */}
      <div className="rail-hide mb-3 px-1.5">
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
          <span className="rail-hide truncate">{hy.profile.title}</span>
        </Link>

        {/* Владелец на маленькой мойке моет и сам, поэтому переключение
            между кабинетом и записью стоит рядом с выходом, а не среди
            разделов: это не раздел, а вторая половина продукта. */}
        {/* Две строки, а не две половины.

            В два столбца это не помещается физически: рейка 244 пикселя,
            половина — сотня, а «Սեփականատեր» в одиннадцать армянских
            букв просит полторы. Обе подписи обрывались многоточием, и
            переключатель показывал «Աշխատակ…» и «Սեփական…» — два огрызка,
            по которым не прочесть, куда ты попадёшь.

            Столбиком слова помещаются целиком, а цель под курсором
            становится вдвое шире. Что это переключатель, а не ещё два
            раздела, говорит жёлоб: разделы выше лежат прямо на рейке. */}
        <nav
          className="mb-3 grid gap-0.5 rounded-[10px] p-1"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
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
              className="nav-item relative !rounded-[7px]"
              style={
                active === tab.key
                  ? { color: 'var(--board)', fontWeight: 600 }
                  : { color: 'var(--board-muted)' }
              }
            >
              {active === tab.key && <SwitchMark id="rail-role" />}
              {/* Точка вместо значка: у разделов значок говорит «что это»,
                  здесь достаточно сказать «ты тут». */}
              <span className="nav-mark relative z-[1] items-center" aria-hidden>
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: 'currentColor',
                    opacity: active === tab.key ? 1 : 0.35,
                  }}
                />
              </span>
              <span className="rail-hide relative z-[1] truncate">{tab.label}</span>
            </Link>
          ))}
        </nav>

        <div className="rail-tools flex items-center gap-1 px-0.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
