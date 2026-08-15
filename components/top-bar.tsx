import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguagePicker } from '@/components/language-picker';
import { Logo } from '@/components/logo';
import { PointSwitcher } from '@/components/point-switcher';
import type { Point } from '@/lib/accounts';
import type { Role } from '@/lib/auth';
import { Bell } from '@/components/bell';
import type { Alert } from '@/lib/alerts';
import { getDict } from '@/lib/i18n/server';

export async function TopBar({
  tenantName,
  subtitle,
  role,
  active,
  points,
  currentTid,
  alerts,
  shiftOpen,
}: {
  tenantName: string;
  subtitle: string;
  role: Role;
  active?: 'work' | 'owner';
  /** поводы для колокольчика; у мойщика их нет вовсе */
  alerts?: Alert[];
  /** точки человека; одна или ни одной — переключателя нет */
  points?: Point[];
  currentTid?: string;
  /** смена открыта: выход тогда объясняет, что она такой и останется */
  shiftOpen?: boolean;
}) {
  const t = await getDict();
  /* У кого одна мойка, тот не должен узнать, что бывают вторые: ни
     стрелки, ни лишнего элемента, ни изменившейся разметки. Условие
     стоит здесь, а не внутри переключателя, именно поэтому — ветка
     возвращает ровно тот же div, что был до всей этой работы. */
  const many = !!points && points.length > 1 && !!currentTid;

  return (
    /* Шапка живёт на телефоне: на компьютере всё то же самое стоит в
       боковой колонке. Поэтому она в цветах полотна, а не страницы —
       иначе сверху висела бы полоса чужого тона. */
    <header
      className="sticky top-0 z-20 px-[var(--seam)] py-3 backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--board) 90%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--board-ink) 8%, transparent)',
      }}
    >
      {/* На телефоне переключатель ролей уходит на вторую строку.
          Иначе три элемента в ряд сжимают название бизнеса до одной
          буквы — а владелец должен видеть, куда он вошёл. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5">
          <Logo size={26} withName={false} />
          {many ? (
            <PointSwitcher points={points!} currentId={currentTid!} subtitle={subtitle} />
          ) : (
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{tenantName}</div>
              {/* Имя и роль одной строкой. Роль здесь не украшение: один
                  телефон на мойке ходит по рукам, и «кто сейчас вошёл»
                  должно читаться до того, как человек начнёт записывать
                  машины на чужой заработок. У владельца её называют
                  вкладки ниже, поэтому там она не повторяется. */}
              <div className="truncate text-[12px]" style={{ color: 'var(--board-muted)' }}>
                {role === 'owner' ? subtitle : `${subtitle} · ${t.roles.staff}`}
              </div>
            </div>
          )}
        </div>

        <div className="order-2 flex shrink-0 items-center gap-1">
          {alerts && <Bell alerts={alerts} />}
          {/* Язык — здесь же, где тема: у мойщика нет ни кабинета, ни
              страницы профиля, и это единственное место, где он может
              переключить продукт на свой язык. */}
          <LanguagePicker compact />
          <ThemeToggle />
          <SignOutButton shiftOpen={shiftOpen} />
        </div>

        {/* Владелец переключается между своим кабинетом и экраном записи:
            на маленькой мойке он и сам моет. */}
        {role === 'owner' && (
          /* Выбранная сторона — белая плашка на сером жёлобе, а не
             мандариновая заливка: это «вы находитесь здесь», а мандарин
             в продукте означает «нажми меня». */
          <nav
            className="order-3 flex w-full gap-0.5 rounded-[8px] p-[3px] sm:order-2 sm:w-auto"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
          >
            {(
              [
                { href: '/work', key: 'work', label: t.roles.staff },
                { href: '/owner', key: 'owner', label: t.roles.owner },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active === tab.key ? 'page' : undefined}
                className="flex-1 rounded-[6px] px-3 py-1.5 text-center text-[13px] transition-colors sm:flex-none"
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
        )}
      </div>
    </header>
  );
}
