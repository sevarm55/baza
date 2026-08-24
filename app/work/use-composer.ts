'use client';

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { addOrder, lookupClient } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import {
  enqueue,
  flushQueue,
  newRef,
  stamp,
  queueSnapshot,
  rejected,
  serverSnapshot,
  subscribe,
  waiting,
  type QueuedOrder,
} from '@/lib/offline';
import type { Payment } from '@/lib/orders';
import { crewSplit, MAX_CREW } from '@/lib/crew';
import { normalizeClientKey } from '@/lib/client-key';
import type { Known, OrderFlowProps, Service, Step } from './order-model';

/**
 * Запись машины: состояние, правила и отправка — без единого пикселя.
 *
 * Представлений у формы два: на телефоне это полноэкранный лист с
 * оплатой у большого пальца, на компьютере панель внутри страницы. А
 * правила у них одни и те же — цена по классу, потолок скидки, доля
 * команды, очередь без связи, — и жить эти правила обязаны в одном
 * месте. Иначе «телефон посчитал зарплату иначе, чем браузер» становится
 * вопросом времени, а не возможностью.
 *
 * Хук ОДИН на экран, даже когда представлений на нём два: досылка
 * накопленного и поиск клиента при наборе — работа, а не отрисовка, и
 * делать её дважды значит дважды отправить одну машину.
 */
export function useComposer({
  canWrite,
  tiers,
  currency,
  clientIdType,
  mates,
  teamPercent,
}: Pick<
  OrderFlowProps,
  'canWrite' | 'tiers' | 'currency' | 'clientIdType' | 'mates' | 'teamPercent'
>) {
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

  /* Что уже собрано и что из этого можно отправить. Считается здесь, а
     не в каждом представлении: «готово» — правило формы, а не свойство
     раскладки. */
  const queued = waiting(queue);
  const stuck = rejected(queue);
  const ready = resolvedClientKey.length > 0 && chosen.length > 0 && payment !== null;

  return {
    /* состояние */
    step,
    clientKey,
    chosen,
    tier,
    tiers,
    payment,
    passId,
    showDiscount,
    discountText,
    helpers,
    together,
    known,
    error,
    saved,
    pending,
    syncing,
    queue,
    queued,
    stuck,
    resolvedClientKey,

    /* производные */
    priceOf,
    listTotal,
    charged,
    discounted,
    canShare,
    working,
    crewIds,
    crewSize,
    split,
    ready,
    money,
    maxCrew: MAX_CREW,

    /* действия */
    setStep,
    setClientKey,
    setChosen,
    setPicked,
    setPayment,
    setPassId,
    setShowDiscount,
    setDiscountText,
    setHelpers,
    setTogether,
    close,
    submit,
  };
}

export type Composer = ReturnType<typeof useComposer>;
