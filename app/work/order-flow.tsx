'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Banknote, CreditCard, Percent, Plus, Ticket, X } from 'lucide-react';

import { addOrder, lookupClient } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import { currencySymbol, formatMoney } from '@/lib/money';
import {
  drop,
  enqueue,
  flushQueue,
  newRef,
  stamp,
  queueSnapshot,
  rejected,
  retry,
  serverSnapshot,
  subscribe,
  waiting,
  type QueuedOrder,
} from '@/lib/offline';
import type { Payment } from '@/lib/orders';
import { crewSplit, MAX_CREW } from '@/lib/crew';
import { hhmm } from '@/lib/time';
import { staffCount } from '@/lib/i18n/terms';
import { normalizeClientKey } from '@/lib/client-key';
import { cn } from '@/lib/utils';
import { LoadingButton, RefreshIndicator } from '@/components/loading';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { FormMessage } from '@/components/patterns/form';
import { MoneyValue } from '@/components/patterns/metric';
import { PersonDot } from '@/components/patterns/person';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { RevokeOrder } from './revoke-order';

/**
 * Коллега в списке «помыли вместе».
 *
 * `onShift` решает, показывать его вообще: отметить участником можно
 * только того, кто встал на смену. Признак, а не готовый отфильтрованный
 * список: «коллег нет вовсе» и «все ушли домой» разные ответы, и форма
 * обязана их различать.
 */
type Mate = { id: string; name: string; onShift: boolean };

type Service = {
  id: string;
  name: string;
  /** базовая цена: класс не выбран или у него своей цены нет */
  price: number;
  /** цена по каждому классу, в порядке `tiers`; считает сервер */
  prices: number[];
};
type Recent = {
  id: string;
  clientKey: string | null;
  serviceName: string;
  price: number;
  payment: string;
  at: string;
  /** сколько причитается смотрящему за эту машину */
  earned: number;
  /** сколько человек её мыли; 1 обычная одиночная мойка */
  crew: number;
  /**
   * Запись сделал смотрящий. От этого зависит, показывать ли отмену:
   * чужую совместную мойку человек видит, но отменять её не вправе, и
   * кнопка, которая всегда отвечает отказом, хуже отсутствующей.
   */
  mine: boolean;
};
type ActivePass = {
  id: string;
  serviceId: string | null;
  serviceName: string;
  remaining: number;
};
type Known = {
  visits: number;
  total: number;
  lastSeenAt: string;
  /** каким классом эту машину записывали в прошлый раз */
  lastTier: string | null;
  passes: ActivePass[];
};

/**
 * Что на экране.
 *
 * Номер, услуга и оплата стоят на одном экране в том порядке, в каком
 * идёт работа. Оплата это выбор, а не отправка: последнее движение
 * отдельная кнопка, и на ней стоит то, что произойдёт, и за сколько.
 *
 * ПОСЛЕ ЗАПИСИ ФОРМА ЗАКРЫВАЕТСЯ. Подтверждение, которому верят, это
 * машина в журнале и выросший счётчик; они на общем экране, туда и
 * возвращаемся. Следующая машина начинается с той же большой кнопки.
 */
type Step = 'home' | 'compose';

/* Способы оплаты одним тоном: цвет несёт ровно одно, который выбран. */
function payments(t: Dict): { key: Payment; label: string; Icon: typeof Banknote }[] {
  return [
    { key: 'cash', label: t.payment.cash, Icon: Banknote },
    { key: 'card', label: t.payment.card, Icon: CreditCard },
    { key: 'transfer', label: t.payment.transfer, Icon: ArrowLeftRight },
  ];
}

/* Выбранная фишка: рамка и заливка бренда, как у выбранной строки в
   кабинете. Одна и та же для класса, коллеги, услуги. */
const PICKED =
  'aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground aria-pressed:hover:bg-primary-soft';

export function OrderFlow({
  canWrite,
  services,
  tiers,
  tierLabel,
  currency,
  clientIdLabel,
  clientIdType,
  unitOne,
  addLabel,
  recent,
  timezone,
  shiftOpen,
  mates,
  teamPercent,
  staffRole,
}: {
  canWrite: boolean;
  services: Service[];
  /** классы машин бизнеса; пусто: ряда нет */
  tiers: string[];
  /** как бизнес называет класс: «Դաս», «Тип кузова» */
  tierLabel: string;
  currency: string;
  clientIdLabel: string;
  clientIdType: string;
  /** «մեքենա»: ниша называет единицу учёта сама */
  unitOne: string;
  addLabel: string;
  recent: Recent[];
  /* Часовой пояс мойки приходит пропом, а не берётся из браузера: иначе
     время записи меняется на глазах при гидратации. */
  timezone: string;
  /** смена открыта: пусто здесь означает разное до неё и внутри неё */
  shiftOpen: boolean;
  /** коллеги без себя, с признаком «на смене» */
  mates: Mate[];
  /** общий процент команды; null: выбора «кто мыл» нет вовсе */
  teamPercent: number | null;
  /** «мойщик»: слово ниши, им считаем людей */
  staffRole: string;
}) {
  const t = useT();
  const [wanted, setStep] = useState<Step>('home');
  const [clientKey, setClientKey] = useState('');
  /* Выбранные услуги: за один заезд делают комплекс и химчистку, и
     двумя машинами это записывать нельзя. */
  const [chosen, setChosen] = useState<Service[]>([]);
  /** класс, который выбрал сам мойщик; null: ещё не трогал */
  const [picked, setPicked] = useState<number | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [passId, setPassId] = useState<string | null>(null);
  /** Скидка: развёрнута ли строка и что в ней набрано. */
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountText, setDiscountText] = useState('');
  /* Отмеченные коллеги. Пусто: мыл один, и это состояние по умолчанию. */
  const [helpers, setHelpers] = useState<string[]>([]);
  /* Переключатель отдельно от списка отмеченных: человек выбирает
     «вместе» раньше, чем успевает кого-то отметить. */
  const [together, setTogether] = useState(false);
  const [known, setKnown] = useState<Known | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const queue = useSyncExternalStore(subscribe, queueSnapshot, serverSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Засов на время отправки. `pending` от useTransition для этого мало:
     между двумя касаниями мокрого экрана перерисовки может не быть. */
  const sending = useRef(false);
  /* Идёт досылка накопленного без связи. Журнал остаётся целиком. */
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();
  const resolvedClientKey =
    clientIdType === 'plate'
      ? normalizeClientKey(clientKey)
      : clientKey.trim().toUpperCase();

  /* Форма закрывается сама, когда записывать стало нельзя: смену
     закрывает вечер и закрывает владелец. Считаем, а не синхронизируем
     эффектом. */
  const step: Step = canWrite ? wanted : 'home';

  /* Класс машины: свой выбор поверх подсказанного из прошлой записи
     этой машины. Считается при отрисовке, а не эффектом: порядок явный,
     что выбрал человек, то и стоит. */
  const suggested = (() => {
    const last = known?.lastTier;
    if (!last) return null;
    const i = tiers.findIndex((name) => name.toLowerCase() === last.toLowerCase());
    return i >= 0 ? i : null;
  })();
  const tier = picked ?? suggested;

  /** Цена услуги в выбранном классе. Ряд посчитал сервер. */
  const priceOf = (s: Service) => (tier === null ? s.price : (s.prices[tier] ?? s.price));

  /** Сколько стоит по прайсу всё выбранное. */
  const listTotal = chosen.reduce((sum, s) => sum + priceOf(s), 0);

  /* Сколько возьмём: набранная сумма или прайс. Выше прайса не пускаем,
     то же правило стоит на сервере. */
  const typed = Number.parseInt(discountText, 10);
  const charged =
    showDiscount && Number.isFinite(typed) ? Math.max(0, Math.min(typed, listTotal)) : listTotal;
  const discounted = charged < listTotal;

  /* Совместная работа предлагается, только когда её есть с кем делать и
     когда владелец назначил общий процент. */
  const canShare = teamPercent !== null && mates.length > 0;
  /* Выбирать можно только тех, кто на смене: остальных сервер всё равно
     не примет. */
  const working = mates.filter((m) => m.onShift);
  /* Отмеченные, которых уже нет среди работающих, в расчёт не идут:
     коллега мог закрыть смену, пока форма открыта. */
  const crewIds =
    canShare && together ? helpers.filter((id) => working.some((m) => m.id === id)) : [];
  const crewSize = crewIds.length + 1;

  /* Будущая зарплата тем же кодом, которым её посчитает сервер
     (`lib/crew.ts`): до драма, включая остаток от деления. */
  const split = crewSplit({
    price: charged,
    people: crewSize,
    /* Личная ставка сюда не приезжает: при одном участнике блок не
       показывается вовсе. */
    soloPercent: 0,
    teamPercent,
  });

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  /* Досылаем накопленное при загрузке и как только связь вернулась.
     Сервер отсеет повторы по ref, поэтому лишняя попытка безвредна. */
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) setSyncing(true);
      void flushQueue(async (item) => {
        await addOrder({
          clientKey: item.clientKey,
          /* Обе формы: в очереди могли остаться записи, сделанные до
             появления мультивыбора. */
          serviceId: item.serviceIds?.length ? undefined : item.serviceId,
          serviceIds: item.serviceIds,
          payment: item.payment,
          passId: item.passId,
          /* Цену шлём только когда она отличается от прайса. */
          price:
            item.listPrice !== undefined && item.price < item.listPrice ? item.price : undefined,
          tier: item.tier,
          participantIds: item.participantIds,
          clientRef: item.ref,
        });
      })
        .then((sent) => {
          if (sent > 0) router.refresh();
        })
        .finally(() => {
          if (alive) setSyncing(false);
        });
    };

    run();
    window.addEventListener('online', run);
    return () => {
      alive = false;
      window.removeEventListener('online', run);
    };
  }, [router]);

  /* Подсказка о клиенте ищется во время набора с задержкой в 250 мс.
     Слишком короткий номер гасит подсказку через ту же задержку. */
  useEffect(() => {
    if (step !== 'compose') return;
    const key = resolvedClientKey;
    const timer = setTimeout(() => {
      if (key.length < 3) {
        setKnown(null);
        return;
      }
      lookupClient(key)
        .then(setKnown)
        .catch(() => setKnown(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [resolvedClientKey, step]);

  useEffect(() => {
    if (step === 'compose') inputRef.current?.focus();
  }, [step]);

  /** Закрыть форму и обнулить набранное. */
  function close() {
    setStep('home');
    setClientKey('');
    setChosen([]);
    setPayment(null);
    setPassId(null);
    setPicked(null);
    setKnown(null);
    setShowDiscount(false);
    setDiscountText('');
    /* Состав сбрасывается вместе со всем остальным: забытая галочка
       запишет коллеге чужую машину. */
    setTogether(false);
    setHelpers([]);
    setError(null);
  }

  /** Записалось: на общий экран, строка «записано» держится пару секунд. */
  function succeed() {
    close();
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  }

  function submit() {
    if (chosen.length === 0 || !payment || !resolvedClientKey) return;
    if (sending.current) return;
    sending.current = true;
    setSaved(false);
    setError(null);

    const item: QueuedOrder = {
      ref: newRef(),
      clientKey: resolvedClientKey,
      /* Старое поле заполняем всегда: запись могла быть сделана этой
         версией, а отправлена после отката на прежнюю. */
      serviceId: chosen[0].id,
      serviceIds: chosen.map((s) => s.id),
      serviceName: chosen.map((s) => s.name).join(' + '),
      price: charged,
      listPrice: listTotal,
      payment,
      passId: passId ?? undefined,
      /* Класс уходит словом, а не номером: пока запись лежит в очереди,
         владелец мог переставить классы местами. */
      tier: tier === null ? undefined : tiers[tier],
      participantIds: crewIds.length > 0 ? crewIds : undefined,
      at: stamp(),
    };

    // без связи даже не пытаемся: запись ложится в очередь, мойщик
    // видит успех и моет дальше
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueue(item);
      sending.current = false;
      succeed();
      return;
    }

    startTransition(async () => {
      try {
        await addOrder({
          clientKey: item.clientKey,
          serviceIds: item.serviceIds,
          payment: item.payment,
          passId: item.passId,
          price: discounted ? item.price : undefined,
          tier: item.tier,
          participantIds: item.participantIds,
          clientRef: item.ref,
        });
        succeed();
      } catch {
        // связь могла оборваться прямо во время отправки
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          enqueue(item);
          succeed();
          return;
        }
        /* Набранное остаётся на месте: набирать заново из-за пропавшей
           на секунду связи значит потерять машину, а не запись. */
        setError(t.work.addFailed);
      } finally {
        sending.current = false;
      }
    });
  }

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* ------------------------------ журнал ------------------------------ */

  /* Вне смены и без единой записи журнала нет вовсе: состояние уже
     названо строкой под заработком и подписью под кнопкой. Как только
     смену откроют или появится хоть одна запись, он возвращается. */
  /* `queued` и `stuck`, а не `pending`: имя занято useTransition. */
  const queued = waiting(queue);
  const stuck = rejected(queue);
  const nothingYet = recent.length === 0 && queue.length === 0;
  /* Место под меню строки резервируется у всех строк, когда оно есть
     хотя бы у одной: иначе суммы в соседних строках разъезжаются. */
  const anyMine = recent.some((o) => o.mine);
  const journal = !shiftOpen && nothingYet ? null : (
    <Panel
      title={t.work.recent}
      count={nothingYet ? undefined : recent.length + queue.length}
      padded={false}
      actions={<RefreshIndicator active={syncing} label={t.common.refreshing} />}
    >
      {nothingYet ? (
        /* Пусто до смены и пусто на смене разные ответы. */
        <EmptyState
          compact
          title={shiftOpen ? t.work.emptyOpen : t.work.emptyOff}
          description={shiftOpen ? t.work.emptyOpenNote : t.work.emptyOffNote}
        />
      ) : (
        <ul className="divide-y divide-border">
          {/* Отвергнутые первыми и с разбором: названы тем, что есть,
              вместе с причиной, и решает человек. Сама очередь работу
              мойщика не выбрасывает. */}
          {stuck.map((q) => (
            <li key={q.ref} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="num truncate text-sm font-semibold">{q.clientKey}</div>
                <div className="truncate text-xs text-destructive">
                  {[q.serviceName, q.failure].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      retry(q.ref);
                      router.refresh();
                    }}
                  >
                    {t.payroll.retry}
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => drop(q.ref)}>
                    {t.expenses.remove}
                  </Button>
                </div>
              </div>
              <MoneyValue className="shrink-0 text-sm font-semibold">{money(q.price)}</MoneyValue>
              {anyMine && <span className="size-8 shrink-0" aria-hidden />}
            </li>
          ))}

          {queued.map((q) => (
            <li key={q.ref} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="num truncate text-sm font-semibold">{q.clientKey}</div>
                <div className="truncate text-xs text-warning">
                  {[q.serviceName, t.work.pending].join(' · ')}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <MoneyValue className="block text-sm font-semibold">{money(q.price)}</MoneyValue>
                <span className="num block text-xs text-muted-foreground">{hhmm(q.at, timezone)}</span>
              </div>
              {anyMine && <span className="size-8 shrink-0" aria-hidden />}
            </li>
          ))}

          {recent.map((o) => {
            /* Номер машины крупно, услуга и оплата под ним: искать свою
               ошибку по названию услуги значит читать список целиком. */
            const shared = o.crew > 1;
            const detail = [
              o.serviceName,
              paymentLabel(o.payment, t),
              hhmm(o.at, timezone),
              /* Совместная словом и числом людей: иначе цена 12 000 при
                 заработке 1 800 необъяснима. */
              shared ? `${t.crew.joint} · ${staffCount(o.crew, staffRole, t.locale)}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-sm font-semibold">
                    {o.clientKey ?? o.serviceName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.clientKey ? detail : `${paymentLabel(o.payment, t)} · ${hhmm(o.at, timezone)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <MoneyValue className="block text-sm font-semibold">{money(o.price)}</MoneyValue>
                  {/* Своя доля только у совместной: у одиночной она и
                      так вся сверху. */}
                  {shared && (
                    <MoneyValue className="block text-xs text-muted-foreground">
                      {money(o.earned)}
                    </MoneyValue>
                  )}
                </div>
                {/* Отменить можно только свою запись, см. `Recent.mine`. */}
                {o.mine ? (
                  <RevokeOrder
                    orderId={o.id}
                    title={o.clientKey ?? o.serviceName}
                    detail={`${o.serviceName} · ${money(o.price)}`}
                  />
                ) : (
                  anyMine && <span className="size-8 shrink-0" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  /* ------------------------------ главная ------------------------------ */
  if (step === 'home') {
    /* Вне смены и без единой записи показывать нечего: пустая коробка
       добавила бы странице лишний отступ. */
    if (!canWrite && !saved && queued.length === 0 && journal === null) return null;
    return (
      <div className="flex flex-col gap-4">
        {/* Кнопка есть только тогда, когда ею можно пользоваться: вне
            смены на её месте стоит начало смены, см. StartShift. */}
        {canWrite && (
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-[15px]"
            onClick={() => setStep('compose')}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {addLabel}
          </Button>
        )}

        {/* «Записано» строкой, а не экраном: ничего не закрывает, а
            подтверждение, которому верят, машина в журнале ниже. */}
        {saved && <FormMessage tone="success">{t.work.saved}</FormMessage>}

        {/* Работа не потерялась, даже если связи нет прямо сейчас.
            Отвергнутые здесь не считаем: они ждут решения в журнале. */}
        {queued.length > 0 && (
          <FormMessage tone="info" className="text-warning">
            {t.work.waitingToSend(queued.length)}
          </FormMessage>
        )}

        {journal}
      </div>
    );
  }

  /* ----------------------------- запись ------------------------------ */
  /* Абонемент покрывает ОДНУ услугу, поэтому предлагается только когда
     выбрана одна. */
  const single = chosen.length === 1 ? chosen[0] : null;
  const activePass = single
    ? known?.passes?.find((p) => p.serviceId === single.id)
    : undefined;
  /* Абонемент выбран, а клиент сменил услугу: списывать больше нечего. */
  const usingPass = payment === 'pass' && Boolean(activePass);
  const ready = resolvedClientKey.length > 0 && chosen.length > 0 && payment !== null;
  const sum = usingPass ? t.payment.pass : formatMoney(charged, currency);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={addLabel}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.common.cancel}
            disabled={pending}
            onClick={close}
          >
            <X aria-hidden />
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {saved && <FormMessage tone="success">{t.work.saved}</FormMessage>}

          {/* Номер первым: сначала подъехала машина, потом решают, что с
              ней делают. Пробел и дефис не принимаем вовсе: номер
              выглядит одинаково везде с первой набранной буквы. */}
          <Field>
            <FieldLabel htmlFor="order-client-key">{clientIdLabel}</FieldLabel>
            <Input
              id="order-client-key"
              ref={inputRef}
              className="num h-11 text-lg uppercase md:text-lg"
              value={clientKey}
              onChange={(e) =>
                setClientKey(
                  clientIdType === 'phone'
                    ? e.target.value
                    : e.target.value.replace(/[\s-]+/g, '').toUpperCase(),
                )
              }
              onBlur={() => setClientKey(resolvedClientKey)}
              inputMode={clientIdType === 'phone' ? 'tel' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            {/* Узнавание постоянного прямо при наборе: мойщик видит, что
                машина уже была, до того как назовёт цену. */}
            {known && (
              <FormMessage tone="success" className="text-xs">
                {t.work.knownClient(
                  known.visits,
                  agoLabel(known.lastSeenAt, t),
                  money(known.total),
                )}
              </FormMessage>
            )}
          </Field>

          {/* Класс машины сразу под номером и ВЫШЕ услуг: класс
              принадлежит машине, выбирается один раз на заезд, и цены
              всех услуг ниже сразу пересчитываются. */}
          {tiers.length > 0 && (
            <div className="flex flex-col gap-2">
              <Caption>{tierLabel}</Caption>
              <div className="flex flex-wrap gap-2" role="group" aria-label={tierLabel}>
                {tiers.map((name, i) => (
                  <Toggle
                    key={name}
                    variant="outline"
                    size="lg"
                    className={cn('h-11 px-4 bg-card', PICKED)}
                    pressed={tier === i}
                    onPressedChange={() => setPicked(i)}
                  >
                    {name}
                  </Toggle>
                ))}
              </div>
            </div>
          )}

          {/* Услуги плитками с ценой, которую сейчас возьмут. Повторное
              нажатие снимает выбор; выбрать можно несколько. */}
          <div className="flex flex-col gap-2">
            <Caption>{t.work.stepService}</Caption>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={t.work.stepService}>
              {services.map((s) => {
                const on = chosen.some((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      'flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                      on
                        ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                        : 'border-border bg-card hover:bg-muted',
                    )}
                    onClick={() => {
                      setChosen((cur) =>
                        on ? cur.filter((x) => x.id !== s.id) : [...cur, s],
                      );
                      /* Набор услуг сменился, абонемент был от прежнего. */
                      if (payment === 'pass') {
                        setPayment(null);
                        setPassId(null);
                      }
                    }}
                  >
                    <span className="line-clamp-2 w-full text-sm leading-snug font-medium">{s.name}</span>
                    <span className={cn('num text-xs', on ? 'opacity-80' : 'text-muted-foreground')}>
                      {formatMoney(priceOf(s), currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Скидка свёрнута по умолчанию: исключение, и вводит её тот,
              кто её правда даёт. Больше прайса ввести нельзя. */}
          {chosen.length > 0 && !usingPass && (
            showDiscount ? (
              <Field>
                <FieldLabel htmlFor="order-discount">{t.work.discounted}</FieldLabel>
                <InputGroup className="h-11">
                  <InputGroupInput
                    id="order-discount"
                    className="num text-end text-base"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder={String(listTotal)}
                    autoComplete="off"
                    autoFocus
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-ml-2 text-muted-foreground"
                  onClick={() => setShowDiscount(true)}
                >
                  <Percent data-icon="inline-start" aria-hidden />
                  {t.work.giveDiscount}
                </Button>
              </div>
            )
          )}

          {/* Кто мыл: между услугами и оплатой, потому что меняет сумму
              зарплаты, а не счёта. «Только я» по умолчанию: девять
              записей из десяти одиночные. */}
          {canShare && (
            <div className="flex flex-col gap-2">
              <Caption>{t.crew.who}</Caption>
              {/* Две плитки, а не полоса вкладок: «вместе с коллегами»
                  по-армянски не помещается в половину ширины телефона
                  одной строкой, и подписи здесь разрешено переноситься. */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.crew.who}>
                <Toggle
                  variant="outline"
                  size="lg"
                  className={cn('h-auto min-h-11 bg-card px-3 py-2 whitespace-normal', PICKED)}
                  pressed={!together}
                  onPressedChange={() => {
                    setTogether(false);
                    /* Отметки снимаем сразу: свёрнутые они не видны, а
                       уходят на сервер и делят деньги молча. */
                    setHelpers([]);
                  }}
                >
                  {t.crew.onlyMe}
                </Toggle>
                <Toggle
                  variant="outline"
                  size="lg"
                  className={cn('h-auto min-h-11 bg-card px-3 py-2 whitespace-normal', PICKED)}
                  pressed={together}
                  onPressedChange={() => setTogether(true)}
                >
                  {t.crew.together}
                </Toggle>
              </div>

              {together &&
                (working.length === 0 ? (
                  /* Коллеги есть, но все вне смены: пустой список читался
                     бы поломкой, а причина рабочая и поправимая. */
                  <FormMessage tone="info" className="text-warning">
                    {t.crew.nobodyOnShift}
                  </FormMessage>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t.crew.together}>
                      {working.map((m) => {
                        const on = crewIds.includes(m.id);
                        return (
                          <Toggle
                            key={m.id}
                            variant="outline"
                            size="lg"
                            className={cn('h-11 gap-2 bg-card px-3.5', PICKED)}
                            pressed={on}
                            /* Потолок стоит и здесь, и на сервере: отказ
                               не должен прилетать после «добавить». */
                            disabled={!on && crewSize >= MAX_CREW}
                            onPressedChange={() =>
                              setHelpers((cur) =>
                                on ? cur.filter((id) => id !== m.id) : [...cur, m.id],
                              )
                            }
                          >
                            <PersonDot name={m.name} />
                            {m.name}
                          </Toggle>
                        );
                      })}
                    </div>

                    {/* Что получится, числами и до нажатия: мойщик видит
                        СВОЮ долю раньше, чем согласится. Числа те же, что
                        посчитает сервер. */}
                    {crewIds.length === 0 ? (
                      <FieldDescription className="text-xs">{t.crew.percentHint}</FieldDescription>
                    ) : (
                      <div className="flex flex-col gap-1.5 rounded-md bg-muted p-3 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium">{staffCount(crewSize, staffRole, t.locale)}</span>
                          <span className="num text-muted-foreground">
                            {t.crew.teamPercent} {split.percent}%
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                          <span>{t.crew.pool}</span>
                          <MoneyValue className="font-medium text-foreground">
                            {formatMoney(split.pool, currency)}
                          </MoneyValue>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                          <span>{t.crew.yours}</span>
                          <MoneyValue className="font-semibold text-foreground">
                            {formatMoney(split.shares[0] ?? 0, currency)}
                          </MoneyValue>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Итог и оплата низом, у большого пальца руки. Сумма появляется
              сразу после выбора услуги: считать в уме мойщик не должен. */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t.work.toPay}</span>
              <span className="flex items-baseline gap-2">
                {/* Зачёркнутый прайс рядом со взятой суммой: без него
                    скидку не видно ни мойщику, ни тому, кто смотрит
                    через плечо. */}
                {discounted && !usingPass && (
                  <MoneyValue className="text-sm text-muted-foreground line-through">
                    {formatMoney(listTotal, currency)}
                  </MoneyValue>
                )}
                <MoneyValue
                  tone={discounted && !usingPass ? 'warning' : 'default'}
                  className="text-2xl leading-none font-semibold tracking-[-0.02em]"
                >
                  {sum}
                </MoneyValue>
              </span>
            </div>

            <Caption>{t.work.stepPayment}</Caption>

            {/* Абонемент первым и во всю ширину: если он у клиента есть,
                брать деньги повторно прямая ошибка. */}
            {activePass && (
              <Button
                type="button"
                variant={usingPass ? 'default' : 'outline'}
                size="lg"
                className="h-11 w-full justify-between px-4"
                aria-pressed={usingPass}
                onClick={() => {
                  setPayment('pass');
                  setPassId(activePass.id);
                }}
              >
                <span className="flex items-center gap-2">
                  <Ticket className="size-[18px]" aria-hidden />
                  {t.payment.pass}
                </span>
                <span className="num font-normal">
                  {t.passes.remaining} {activePass.remaining}
                </span>
              </Button>
            )}

            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.work.stepPayment}>
              {payments(t).map((p) => {
                const on = payment === p.key;
                return (
                  <Button
                    key={p.key}
                    type="button"
                    variant={on ? 'default' : 'outline'}
                    size="lg"
                    className="h-14 flex-col gap-1 px-2 text-xs sm:h-11 sm:flex-row sm:gap-2 sm:text-sm"
                    aria-pressed={on}
                    onClick={() => {
                      setPayment(p.key);
                      setPassId(null);
                    }}
                  >
                    <p.Icon className="size-[18px]" aria-hidden />
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Последнее движение, и на нём написано, что произойдёт и за
              сколько. Пока номера, услуги или оплаты нет, кнопка погашена. */}
          <div className="flex flex-col gap-2">
            <LoadingButton
              type="button"
              size="lg"
              className="h-12 w-full text-[15px]"
              busy={pending}
              disabled={!ready}
              label={t.work.addFor(unitOne, sum)}
              busyLabel={t.work.recording}
              onClick={submit}
            />

            {error && <FormMessage tone="error">{error}</FormMessage>}

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
              disabled={pending}
              onClick={close}
            >
              {t.common.cancel}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Журнал остаётся на экране и во время записи: только что
          записанная машина появляется в нём сразу под формой. */}
      {journal}
    </div>
  );
}

/* ------------------------------ мелочи ------------------------------ */

/** Подпись группы внутри формы: тем же кеглем, что подпись поля. */
function Caption({ children }: { children: string }) {
  return <div className="text-sm font-medium">{children}</div>;
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

function agoLabel(iso: string, t: Dict): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(days);
}
