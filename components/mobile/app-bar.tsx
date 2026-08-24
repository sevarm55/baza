'use client';

import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Bell as BellIcon,
  Check,
  Clock3,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wallet,
} from 'lucide-react';

import { signOut, snoozeAlert, switchPoint } from '@/app/actions';
import { MNav, MTopBar } from '@/components/mobile/chrome';
import { TABS_VARIANTS, tabsVariantLabel, useTabsVariant } from '@/components/mobile/tabs';
import { MButton } from '@/components/mobile/controls';
import { MAvatar, MGroup, MNavRow, MRow, MRows } from '@/components/mobile/list';
import { MSheet } from '@/components/mobile/sheet';
import { MEmpty } from '@/components/mobile/states';
import { MBadge } from '@/components/mobile/surface';
import { pageTitle } from '@/components/sections';
import { setTheme, useTheme } from '@/components/use-theme';
import type { Point } from '@/lib/accounts';
import type { Alert } from '@/lib/alerts';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';
import { personColor } from '@/lib/person-color';
import { cn } from '@/lib/utils';

/**
 * Шапка приложения на телефоне — одна на два разных состояния.
 *
 * На корневом экране в строке стоит адрес того, на что смотришь:
 * филиал слева, поводы и учётка справа. Названия экрана здесь нет
 * намеренно — оно живёт под строкой крупным заголовком, и второй раз
 * повторять его в полосе значило бы поставить заголовок над заголовком.
 *
 * На вложенном экране — круглая стрелка, название по центру. Не
 * хлебные крошки: на трёхстах семидесяти точках цепочка из трёх слов не
 * помещается, а рука ищет стрелку в левом верхнем углу и находит её там
 * всегда.
 */
export function MobileAppBar({
  tenantName,
  points,
  currentTid,
  alerts,
  userName,
  roleLabel,
  owner,
  shiftOpen,
}: {
  tenantName: string;
  points: Point[];
  currentTid: string;
  /** поводы для колокольчика; пусто — колокольчика нет вовсе */
  alerts?: Alert[];
  userName: string;
  roleLabel: string;
  owner: boolean;
  shiftOpen?: boolean;
}) {
  const t = useT();
  const pathname = usePathname();

  const parent = parentOf(pathname);
  if (parent) {
    return (
      <MNav
        href={parent}
        title={pageTitle(pathname, t) ?? tenantName}
        backLabel={t.common.back}
        action={<MAccount userName={userName} roleLabel={roleLabel} owner={owner} shiftOpen={shiftOpen} />}
      />
    );
  }

  return (
    <MTopBar
      left={<MBranch points={points} currentId={currentTid} fallback={tenantName} />}
      right={
        <>
          {alerts && <MBell alerts={alerts} />}
          <MAccount userName={userName} roleLabel={roleLabel} owner={owner} shiftOpen={shiftOpen} />
        </>
      }
    />
  );
}

/**
 * Филиал — пилюля с точкой и названием.
 *
 * Точка говорит, что данные читаются: филиал без доступа выглядит
 * иначе, и это видно раньше, чем открыт список. У кого филиал один,
 * пилюля не нажимается и стоит тихим названием: переключаться не с чем.
 */
function MBranch({
  points,
  currentId,
  fallback,
}: {
  points: Point[];
  currentId: string;
  fallback: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = points.find((p) => p.id === currentId);
  const name = current?.name ?? fallback;

  if (points.length <= 1) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-m-lime" />
        <span className="truncate text-[16px] font-bold text-m-ink">{name}</span>
      </span>
    );
  }

  const select = (id: string) => {
    if (id === currentId || pending) {
      setOpen(false);
      return;
    }
    const data = new FormData();
    data.set('tid', id);
    startTransition(async () => {
      /* Service worker кэширует страницы по адресу, а адрес при смене
         точки не меняется: без сброса офлайн показал бы цифры прежней
         мойки под названием новой. */
      navigator.serviceWorker?.controller?.postMessage('bazis:switch');
      await switchPoint(data);
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t.points.title}: ${name}`}
        aria-busy={pending || undefined}
        className="m-press flex h-10 min-w-0 items-center gap-2 rounded-full bg-m-tile pr-3 pl-3.5 outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
      >
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', current?.canRead ? 'bg-m-lime' : 'bg-m-warn')}
        />
        <span className="truncate text-[15px] font-bold text-m-ink">{name}</span>
        <ChevronPair />
      </button>

      <MSheet
        open={open}
        onOpenChange={setOpen}
        title={t.points.title}
        closeLabel={t.common.close}
      >
        <MRows className="pb-2">
          {points.map((point) => (
            <MRow
              key={point.id}
              title={point.name}
              note={point.canRead ? undefined : t.points.needsPayment}
              onClick={() => select(point.id)}
              trailing={
                point.id === currentId ? (
                  <Check aria-hidden className="size-5 shrink-0 text-m-grape" strokeWidth={2.4} />
                ) : undefined
              }
            />
          ))}
        </MRows>
      </MSheet>
    </>
  );
}

/** Две стрелки вверх-вниз: знак «здесь переключают». */
function ChevronPair() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-m-muted" fill="none" aria-hidden>
      <path
        d="M5 6.5L8 3.5L11 6.5M5 9.5L8 12.5L11 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Поводы: список дел, а не лента событий.
 *
 * У каждого повода одно действие, и он гаснет, когда дело сделано.
 * Лаймовая точка на колокольчике — «есть что посмотреть»; числа на ней
 * нет намеренно, поводов не бывает восемнадцать.
 */
function MBell({ alerts }: { alerts: Alert[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [snoozing, setSnoozing] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alerts.length > 0 ? `${t.alerts.title} · ${alerts.length}` : t.alerts.title}
        className="m-press relative flex size-10 items-center justify-center rounded-full bg-m-tile text-m-ink outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
      >
        <BellIcon aria-hidden className="size-[19px]" strokeWidth={2} />
        {alerts.length > 0 && (
          <span
            aria-hidden
            className="absolute top-2 right-2.5 size-2.5 rounded-full border-2 border-m-tile bg-m-lime"
          />
        )}
      </button>

      <MSheet open={open} onOpenChange={setOpen} title={t.alerts.title} closeLabel={t.common.close}>
        {alerts.length === 0 ? (
          <MEmpty icon={BellIcon} title={t.alerts.empty} note={t.alerts.emptyNote} />
        ) : (
          <MRows className="pb-2">
            {alerts.map((a) => (
              <MRow
                key={a.key}
                href={a.href}
                lead={<MBadge icon={a.key === 'payroll-due' ? Wallet : Clock3} tone={a.tone === 'warn' ? 'lime' : 'grape'} />}
                title={a.title}
                note={a.note}
                trailing={
                  <button
                    type="button"
                    aria-busy={pending && snoozing === a.key}
                    onClick={(event) => {
                      event.preventDefault();
                      if (pending) return;
                      setSnoozing(a.key);
                      startTransition(() => snoozeAlert(a.key));
                    }}
                    className="m-press shrink-0 rounded-full bg-m-bg px-3 py-2 text-[12.5px] font-semibold text-m-muted"
                  >
                    {t.alerts.later}
                  </button>
                }
              />
            ))}
          </MRows>
        )}
      </MSheet>
    </>
  );
}

/**
 * Учётка: только то, что относится к человеку, а не к бизнесу.
 *
 * Профиль, настройки бизнеса владельцу, язык, тема, выход. Разделов
 * продукта здесь нет: они живут во вкладках и в «Ещё», и второй список
 * тех же ссылок только путал бы, какой из них главный.
 */
function MAccount({
  userName,
  roleLabel,
  owner,
  shiftOpen,
}: {
  userName: string;
  roleLabel: string;
  owner: boolean;
  shiftOpen?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const { setLocale } = useSetLocale();
  const theme = useTheme();
  const [tabs, setTabs] = useTabsVariant();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  const dropCache = () => navigator.serviceWorker?.controller?.postMessage('bazis:signout');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${userName} · ${roleLabel}`}
        className="m-press shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
      >
        <MAvatar name={userName} color={personColor(userName)} size={40} />
      </button>

      <MSheet
        open={open}
        onOpenChange={setOpen}
        title={userName}
        description={roleLabel}
        closeLabel={t.common.close}
      >
        <div className="flex flex-col gap-4 pb-2">
          <MGroup>
            <MNavRow
              icon={UserRound}
              title={t.profile.title}
              href="/owner/profile"
              onClick={() => setOpen(false)}
            />
            {owner && (
              <MNavRow
                icon={SlidersHorizontal}
                title={t.owner.tabSettings}
                href="/owner/settings"
                onClick={() => setOpen(false)}
              />
            )}
          </MGroup>

          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[12px] font-semibold tracking-[0.06em] text-m-faint uppercase">
              {t.common.language}
            </h3>
            <div className="flex gap-2">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  aria-pressed={locale === code}
                  className={cn(
                    'm-press h-11 flex-1 rounded-m-row text-[15px] font-semibold outline-none',
                    locale === code ? 'bg-m-grape text-white' : 'bg-m-tile text-m-muted',
                  )}
                >
                  {LOCALE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>

          {/* Временный выбор полосы вкладок: владелец смотрит варианты
              прямо в продукте и говорит, какой оставить. Уйдёт вместе с
              лишними вариантами, как только выбор сделан. */}
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[12px] font-semibold tracking-[0.06em] text-m-faint uppercase">
              {t.phone.tabsPick}
            </h3>
            <div className="flex flex-wrap gap-2">
              {TABS_VARIANTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTabs(option)}
                  aria-pressed={tabs === option}
                  className={cn(
                    'm-press h-11 rounded-full px-4 text-[14.5px] font-semibold outline-none',
                    tabs === option ? 'bg-m-grape text-white' : 'bg-m-tile text-m-muted',
                  )}
                >
                  {tabsVariantLabel(option, t)}
                </button>
              ))}
            </div>
            <p className="px-1 text-[12.5px] text-m-faint">{t.phone.tabsPickNote}</p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[12px] font-semibold tracking-[0.06em] text-m-faint uppercase">
              {t.common.theme}
            </h3>
            <div className="flex gap-2">
              {(
                [
                  { value: 'light', label: t.common.themeLightLong, icon: Sun },
                  { value: 'dark', label: t.common.themeDarkLong, icon: Moon },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={selected}
                    className={cn(
                      'm-press flex h-11 flex-1 items-center justify-center gap-2 rounded-m-row text-[15px] font-semibold outline-none',
                      selected ? 'bg-m-grape text-white' : 'bg-m-tile text-m-muted',
                    )}
                  >
                    <Icon aria-hidden className="size-[17px]" strokeWidth={2} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {shiftOpen ? (
            <MButton tone="quiet" block icon={LogOut} onClick={() => setAsking(true)} className="text-m-bad">
              {t.auth.signOut}
            </MButton>
          ) : (
            <form action={signOut} onSubmit={dropCache}>
              <button
                type="submit"
                className="m-press flex h-[var(--m-control-h)] w-full items-center justify-center gap-2 rounded-m-row bg-m-tile text-[16px] font-semibold text-m-bad outline-none"
              >
                <LogOut aria-hidden className="size-[19px]" strokeWidth={2.2} />
                {t.auth.signOut}
              </button>
            </form>
          )}
        </div>
      </MSheet>

      {/* Смена открыта — выход переспрашивает: человек, ушедший из
          продукта с открытой сменой, оставляет её висеть до утра. */}
      {shiftOpen && (
        <MSheet
          open={asking}
          onOpenChange={(next) => !pending && setAsking(next)}
          title={t.work.signOutOpenTitle}
          description={t.work.signOutOpenNote}
          closeLabel={t.common.close}
          footer={
            <div className="flex gap-2">
              <MButton tone="quiet" block onClick={() => setAsking(false)}>
                {t.work.endStay}
              </MButton>
              <MButton
                tone="danger"
                block
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    dropCache();
                    await signOut();
                  })
                }
              >
                {pending ? t.auth.signingOut : t.auth.signOut}
              </MButton>
            </div>
          }
        >
          <span />
        </MSheet>
      )}
    </>
  );
}

/**
 * Куда ведёт стрелка «назад».
 *
 * Адрес считается по самому адресу, а не берётся из истории браузера:
 * `history.back()` уводит с сайта того, кто открыл раздел по ссылке из
 * переписки, — и это единственный случай, когда «назад» ведёт не назад.
 *
 * Пусто значит «это корень вкладки»: там стрелки нет вовсе, а слева
 * стоит филиал.
 */
function parentOf(pathname: string): string | null {
  /* Корни вкладок: сводка, экран смены, зарплаты, «Ещё». */
  if (pathname === '/owner' || pathname === '/work') return null;
  if (pathname === '/owner/payroll' || pathname === '/owner/more') return null;

  /* Машина открывается из списка клиентов, день — из календаря: назад
     ведёт туда, откуда сюда приходят, а не на уровень выше по адресу. */
  if (pathname.startsWith('/owner/clients/')) return '/owner/clients';
  if (pathname.startsWith('/owner/day/')) return '/owner/calendar';
  /* Лента событий — это подробности сводки, и возвращает она туда же. */
  if (pathname.startsWith('/owner/activity')) return '/owner';

  /* Всё остальное открывают из «Ещё» — карты бизнеса. */
  if (pathname.startsWith('/owner/')) return '/owner/more';
  return null;
}
