'use client';

import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { addOrder, lookupClient } from '@/app/actions';
import { formatMoney } from '@/lib/money';
import { RevokeOrder } from './revoke-order';
import { EmptyState } from '@/components/empty-state';
import { Panel, Row } from '@/components/board';
import { IconCard, IconCash, IconCheck, IconTicket, IconTransfer } from '@/components/icons';
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
import { personColor } from '@/lib/person-color';
import { hhmm } from '@/lib/time';
import { staffCount } from '@/lib/i18n/terms';
import { normalizeClientKey } from '@/lib/client-key';

/**
 * Коллега в списке «помыли вместе».
 *
 * `onShift` решает, показывать его вообще: отметить участником можно
 * только того, кто встал на смену. Не встал — значит сегодня не работал,
 * и начислять ему за чужую машину не за что.
 *
 * Признак, а не готовый отфильтрованный список: «коллег нет вовсе» и
 * «все ушли домой» — разные ответы, и форма обязана их различать.
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
  /** сколько человек её мыли; 1 — обычная одиночная мойка */
  crew: number;
  /**
   * Запись сделал смотрящий.
   *
   * От этого зависит, показывать ли отмену. Совместную мойку человек
   * видит у себя и тогда, когда её записал коллега, — но отменять чужую
   * запись он не вправе, и сервер её не отменит. Кнопка, которая всегда
   * отвечает отказом, хуже отсутствующей.
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
 * Мастера из трёх шагов больше нет. Он стоил тех же трёх касаний, но
 * между ними были три смены страницы: мойщик не видел, что уже выбрал,
 * не мог поправить номер, не вернувшись назад, и не знал суммы, пока не
 * дошёл до оплаты. Номер, услуга и оплата стоят на одном экране — в том
 * порядке, в каком идёт работа.
 *
 * Оплата при этом стала выбором, а не отправкой. Раньше касание по
 * способу оплаты и было записью — экономило одно движение и стоило
 * дорого: между «выбрал наличные» и «машина записана» не оставалось
 * ничего, что можно было бы прочитать и передумать, а промах по соседней
 * плитке записывал не тот способ оплаты и правился только отменой всей
 * записи. Теперь последнее движение — отдельная кнопка, и на ней стоит
 * то, что произойдёт, и за сколько.
 *
 * ПОСЛЕ ЗАПИСИ ФОРМА ЗАКРЫВАЕТСЯ. Раньше она оставалась открытой и
 * очищалась — «мойщик записывает машины подряд». На деле это отвечало
 * не на тот вопрос: после нажатия человек хочет увидеть, что машина
 * записалась, а пустая форма на её месте выглядит так, будто ничего не
 * произошло и надо набирать заново. Подтверждение, которому верят, —
 * машина в журнале и выросший счётчик; они на общем экране, туда и
 * возвращаемся. Следующая машина начинается с той же большой кнопки,
 * которой началась эта.
 */
type Step = 'home' | 'compose';

/** Подложка прибора — та же, что рисует `Panel`. */
const PANEL = { background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' } as const;

/* Способы оплаты одним тоном, а не тремя разными.
 *
 * Было: лаймовые наличные, фиолетовая карта, серый перевод — «чтобы
 * попадать пальцем по цветному пятну, не читая». Пятна и правда видно,
 * но все три горели одинаково ярко и всегда, а выбранный не отличался от
 * невыбранного ничем. Экран отвечал «вот три кнопки» вместо «вот что вы
 * выбрали». Лайм при этом означает в продукте главное действие и
 * открытую смену, и третьим значением «наличные» он терял оба.
 *
 * Теперь все три спокойные и одинаковые, а цвет несёт ровно одно:
 * который из них выбран. */
function payments(t: Dict): { key: Payment; label: string; Icon: typeof IconCash }[] {
  return [
    { key: 'cash', label: t.payment.cash, Icon: IconCash },
    { key: 'card', label: t.payment.card, Icon: IconCard },
    { key: 'transfer', label: t.payment.transfer, Icon: IconTransfer },
  ];
}

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
  /** классы машин бизнеса; пусто — ряда нет */
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
  /* Часовой пояс мойки приходит пропом, а не берётся из браузера. Иначе
     время записи меняется прямо на глазах: сервер собирает HTML в своей
     зоне, гидратация пересчитывает его в зоне телефона, и «00:17»
     мигает через «20:17». */
  timezone: string;
  /** смена открыта: пусто здесь означает разное до неё и внутри неё */
  shiftOpen: boolean;
  /**
   * Коллеги — без себя, с признаком «на смене».
   *
   * Себя из списка убирает страница, а не форма: автор записи участник
   * по определению, и галочка напротив собственного имени была бы
   * способом однажды остаться без денег за свою же работу.
   */
  mates: Mate[];
  /**
   * Общий процент команды. Null — свойства у бизнеса нет, и весь выбор
   * «кто мыл» не показывается вовсе: управление, которое ничего не
   * меняет, приходится прочитать, чтобы это понять.
   */
  teamPercent: number | null;
  /** «мойщик» — слово ниши, им считаем людей: «3 мойщика» */
  staffRole: string;
}) {
  const t = useT();
  const [wanted, setStep] = useState<Step>('home');
  const [clientKey, setClientKey] = useState('');
  /**
   * Выбранные услуги.
   *
   * За один заезд делают комплекс и химчистку салона, и до сих пор в
   * браузере это записывали двумя машинами: число машин, средний чек и
   * счётчик визитов клиента выходили завышенными. Телефон умел это
   * давно — и сервер тоже.
   */
  const [chosen, setChosen] = useState<Service[]>([]);
  /** класс, который выбрал сам мойщик; null — ещё не трогал */
  const [picked, setPicked] = useState<number | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [passId, setPassId] = useState<string | null>(null);
  /** Скидка: развёрнута ли строка и что в ней набрано. */
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountText, setDiscountText] = useState('');
  /**
   * Отмеченные коллеги.
   *
   * Пусто — мыл один, и это состояние по умолчанию: девять записей из
   * десяти одиночные, и платить за десятую лишним касанием должны они, а
   * не наоборот.
   */
  const [helpers, setHelpers] = useState<string[]>([]);
  /* Переключатель отдельно от списка отмеченных: человек выбирает
     «вместе с коллегами» раньше, чем успевает кого-то отметить, и до
     первой галочки экран обязан показывать выбор, а не молчать. */
  const [together, setTogether] = useState(false);
  const [known, setKnown] = useState<Known | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const queue = useSyncExternalStore(subscribe, queueSnapshot, serverSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Засов на время отправки. `pending` от useTransition для этого мало:
     между двумя касаниями мокрого экрана перерисовки может не быть, и
     обе попытки войдут в обработчик до того, как кнопка погаснет. Ref
     меняется в ту же миллисекунду, что и первое касание. */
  const sending = useRef(false);
  const router = useRouter();
  const resolvedClientKey =
    clientIdType === 'plate'
      ? normalizeClientKey(clientKey)
      : clientKey.trim().toUpperCase();

  /* Форма закрывается сама, когда записывать стало нельзя. Смена
     кончается не только кнопкой внизу — её закрывает вечер и закрывает
     владелец, — и оставленная открытой форма обещала бы запись, которую
     сервер уже не примет. Считаем, а не синхронизируем эффектом:
     состояние формы выводится из права записи, а не догоняет его лишней
     отрисовкой. */
  const step: Step = canWrite ? wanted : 'home';

  /* Класс машины: свой выбор поверх подсказанного.
   *
   * Знакомый номер подставляет класс сам — из прошлой записи этой машины.
   * Джип не станет седаном между мойками, и требовать за это касание сорок
   * раз за смену не за что.
   *
   * Считается при отрисовке, а не эффектом. Эффект пришлось бы будить на
   * каждое изменение списка классов, а список приходит пропом и на клиенте
   * это новый массив при каждой перерисовке страницы: получилась бы
   * подстановка, срабатывающая сама по себе поверх уже сделанного выбора.
   * Здесь же порядок явный — что выбрал человек, то и стоит. */
  const suggested = (() => {
    const last = known?.lastTier;
    if (!last) return null;
    const i = tiers.findIndex((t) => t.toLowerCase() === last.toLowerCase());
    return i >= 0 ? i : null;
  })();
  const tier = picked ?? suggested;

  /** Цена услуги в выбранном классе. Ряд посчитал сервер. */
  const priceOf = (s: Service) => (tier === null ? s.price : (s.prices[tier] ?? s.price));

  /** Сколько стоит по прайсу всё выбранное. */
  const listTotal = chosen.reduce((sum, s) => sum + priceOf(s), 0);

  /* Сколько возьмём: набранная сумма или прайс. Выше прайса не пускаем —
     то же правило, что на сервере: запись фиксирует сумму, а не
     назначает её. */
  const typed = Number.parseInt(discountText, 10);
  const charged =
    showDiscount && Number.isFinite(typed) ? Math.max(0, Math.min(typed, listTotal)) : listTotal;
  const discounted = charged < listTotal;

  /* Совместная работа предлагается, только когда её есть с кем делать и
     когда владелец назначил общий процент. Иначе выбор «кто мыл» — это
     управление, которое ничего не меняет: его придётся прочитать, чтобы
     это понять, а читают его сорок раз за смену. */
  const canShare = teamPercent !== null && mates.length > 0;
  /* Выбирать можно только тех, кто на смене. Остальные в списке не
     стоят: сервер такую запись всё равно не примет, и показывать имя,
     по которому придёт отказ, значит обещать несуществующее. */
  const working = mates.filter((m) => m.onShift);
  /* Отмеченные, которых уже нет среди работающих, в расчёт не идут:
     коллега мог закрыть смену, пока форма открыта. Считаем по тому, что
     видно. */
  const crewIds =
    canShare && together ? helpers.filter((id) => working.some((m) => m.id === id)) : [];
  const crewSize = crewIds.length + 1;

  /* Будущая зарплата — тем же кодом, которым её посчитает сервер
     (`lib/crew.ts`). Не «примерно», а до драма, включая остаток от
     деления: мойщик видит на экране ровно то число, которое вечером
     окажется в ведомости, и спорить будет не с чем. */
  const split = crewSplit({
    price: charged,
    people: crewSize,
    /* Личная ставка сюда не приезжает и не нужна: при одном участнике
       блок не показывается вовсе — своя доля уже стоит на экране смены
       крупным числом. */
    soloPercent: 0,
    teamPercent,
  });

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  /* Досылаем накопленное при загрузке и как только связь вернулась.
     Сервер отсеет повторы по ref, поэтому лишняя попытка безвредна. */
  useEffect(() => {
    const run = () => {
      void flushQueue(async (item) => {
        await addOrder({
          clientKey: item.clientKey,
          /* Обе формы: в очереди могли остаться записи, сделанные до
             появления мультивыбора, и терять их из-за формата нельзя. */
          serviceId: item.serviceIds?.length ? undefined : item.serviceId,
          serviceIds: item.serviceIds,
          payment: item.payment,
          passId: item.passId,
          /* Цену шлём только когда она отличается от прайса: в обычной
             записи это лишнее поле, а в записи со скидкой — единственное,
             что её сохраняет. */
          price:
            item.listPrice !== undefined && item.price < item.listPrice ? item.price : undefined,
          tier: item.tier,
          /* Состав едет вместе с записью. Уволенного за это время
             сервер отвергнет, и запись повиснет в очереди с причиной —
             ровно как запись с удалённой услугой; решает дальше
             человек. */
          participantIds: item.participantIds,
          clientRef: item.ref,
        });
      }).then((sent) => {
        if (sent > 0) router.refresh();
      });
    };

    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [router]);

  /* Подсказка о клиенте ищется во время набора. Задержка нужна, чтобы
     не бить в сервер на каждую букву, но 250 мс человек не замечает.
     Слишком короткий номер тоже гасит подсказку через ту же задержку —
     иначе получается два разных пути с разной скоростью для одного
     поля, и подсказка то исчезает мгновенно, то через четверть секунды. */
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
    /* Состав сбрасывается вместе со всем остальным. Соблазн оставить его
       «до конца смены» есть — бригада за день не меняется, — но цена
       ошибки несимметрична: забытая галочка запишет коллеге чужую машину
       и уполовинит заработок тому, кто мыл её один. */
    setTogether(false);
    setHelpers([]);
    setError(null);
  }

  /**
   * Записалось.
   *
   * Возвращаемся на общий экран: там машина уже стоит в журнале, а
   * счётчик и деньги пересчитаны — это и есть подтверждение, которому
   * верят. Строка «записано» держится пару секунд поверх него, чтобы
   * связь между нажатием и результатом не пришлось додумывать.
   */
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
         версией, а отправлена — после откате на прежнюю. */
      serviceId: chosen[0].id,
      serviceIds: chosen.map((s) => s.id),
      serviceName: chosen.map((s) => s.name).join(' + '),
      price: charged,
      listPrice: listTotal,
      payment,
      passId: passId ?? undefined,
      /* Класс уходит словом, а не номером: пока запись лежит в очереди без
         связи, владелец мог переставить классы местами, и номер указал бы
         на соседний. Слово либо совпадёт, либо цена будет базовой. */
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
        /* Набранное остаётся на месте. Мойщик набирал номер мокрыми
           руками; заставить его набрать всё заново из-за пропавшей на
           секунду связи — это потерять машину, а не запись. */
        setError(t.work.addFailed);
      } finally {
        sending.current = false;
      }
    });
  }

  /* ------------------------------ журнал ------------------------------ */

  /* Вне смены и без единой записи журнала нет вовсе.

     Экран мойщика вне смены повторял одно и то же четыре раза подряд:
     строкой под заработком («смена не начата»), подписью под кнопкой
     («чтобы записывать, начните смену»), заголовком пустого журнала
     («смена ещё не начата») и его же подписью («начните смену, чтобы
     записывать»). Четыре предложения об одном, на экране, который
     открывают сорок раз за смену.

     Первые два остаются: одно называет состояние, второе объясняет
     единственную кнопку. Журнал же в этот момент не сообщает ничего —
     он пуст и по причине, уже названной дважды выше. Как только смену
     откроют или появится хоть одна запись, он возвращается: пустой
     журнал НА смене — другой ответ, он говорит «всё в порядке, первая
     машина просто ещё не приехала». */
  /* `queued` и `stuck`, а не `pending`: имя `pending` уже занято
     признаком идущей отправки от `useTransition`. */
  const queued = waiting(queue);
  const stuck = rejected(queue);
  const nothingYet = recent.length === 0 && queue.length === 0;
  const journal = !shiftOpen && nothingYet ? null : (
    <Panel title={t.work.recent} count={recent.length + queue.length}>
      <div className="board-journal">
        {/* Отвергнутые первыми и с разбором.

            Раньше отказ сервера обрывал всю очередь, и запись висела в
            ней «ожидающей» вечно: страница обещала, что она уйдёт, а она
            не уходила никогда. Теперь она названа тем, что есть, вместе с
            причиной, и решает человек: повторить (например, после того
            как владелец вернул услугу в прайс) или убрать. Сама очередь
            работу мойщика не выбрасывает. */}
        {stuck.map((q) => (
          <Row key={q.ref}>
            <span className="min-w-0 flex-1">
              <span className="num block truncate text-[14.5px] font-semibold">{q.clientKey}</span>
              <span className="block truncate text-[12.5px]" style={{ color: 'var(--bad)' }}>
                {[q.serviceName, q.failure].filter(Boolean).join(' · ')}
              </span>
              <span className="mt-1 flex gap-2">
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => {
                    retry(q.ref);
                    router.refresh();
                  }}
                >
                  {t.payroll.retry}
                </button>
                <button type="button" className="btn-inline" onClick={() => drop(q.ref)}>
                  {t.expenses.remove}
                </button>
              </span>
            </span>
            <span className="num shrink-0 text-[14px] font-semibold">
              {formatMoney(q.price, currency, t.locale)}
            </span>
          </Row>
        ))}

        {queued.map((q) => (
          <Row key={q.ref}>
            <span className="min-w-0 flex-1">
              <span className="num block truncate text-[14.5px] font-semibold">{q.clientKey}</span>
              <span className="block truncate text-[12.5px]" style={{ color: 'var(--warn-on-board)' }}>
                {[q.serviceName, t.work.pending].join(' · ')}
              </span>
            </span>
            <span className="shrink-0 text-end">
              <span className="num block text-[14px] font-semibold">
                {formatMoney(q.price, currency, t.locale)}
              </span>
              <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                {hhmm(q.at, timezone)}
              </span>
            </span>
          </Row>
        ))}

        {recent.length === 0 && queue.length === 0 ? (
          /* Пусто до смены и пусто на смене — разные ответы. Первый
             говорит, что делать; второй — что всё в порядке и первая
             машина просто ещё не приехала. */
          <EmptyState
            title={shiftOpen ? t.work.emptyOpen : t.work.emptyOff}
            note={shiftOpen ? t.work.emptyOpenNote : t.work.emptyOffNote}
          />
        ) : (
          recent.map((o) => {
            /* Номер машины крупно, услуга и оплата под ним. Из сорока
               записей за смену «Комплекс» встречается двадцать раз, а
               номер один: искать свою ошибку по названию услуги — это
               читать список целиком. */
            const shared = o.crew > 1;
            const detail = [
              o.serviceName,
              paymentLabel(o.payment, t),
              hhmm(o.at, timezone),
              /* Совместная — словом и числом людей. Без этого строка
                 нечитаема: цена 12 000, а заработок 1 800, и почему,
                 неизвестно. */
              shared ? `${t.crew.joint} · ${staffCount(o.crew, staffRole, t.locale)}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Row key={o.id}>
                <span className="min-w-0 flex-1">
                  <span className="num block truncate text-[14.5px] font-semibold">
                    {o.clientKey ?? o.serviceName}
                  </span>
                  <span
                    className="block truncate text-[12.5px]"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    {o.clientKey ? detail : `${paymentLabel(o.payment, t)} · ${hhmm(o.at, timezone)}`}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="num block text-[14px] font-semibold">
                    {formatMoney(o.price, currency, t.locale)}
                  </span>
                  {/* Своя доля — только у совместной. У одиночной она
                      и так вся сверху, и вторая строка под ценой
                      повторяла бы одно число дважды. */}
                  {shared && (
                    <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                      {formatMoney(o.earned, currency, t.locale)}
                    </span>
                  )}
                </span>
                {/* Ошибся номером или услугой — исправляет сам, не бегая
                    к владельцу. Стоит последним и тихо: отменять
                    приходится одну запись из сорока.

                    Только свою. Совместную мойку человек видит у себя и
                    тогда, когда её записал коллега, — но отменять чужую
                    запись он не вправе, и сервер её не отменит. Кнопка,
                    которая всегда отвечает отказом, хуже отсутствующей:
                    к владельцу за отменой человек пойдёт в обоих
                    случаях, но во втором сначала потратит время. */}
                {o.mine && (
                  <RevokeOrder
                    orderId={o.id}
                    title={o.clientKey ?? o.serviceName}
                    detail={`${o.serviceName} · ${formatMoney(o.price, currency, t.locale)}`}
                  />
                )}
              </Row>
            );
          })
        )}
      </div>
    </Panel>
  );

  /* ------------------------------ главная ------------------------------ */
  if (step === 'home') {
    return (
      <div className="grid content-start gap-[var(--seam)]">
        {/* Кнопка есть только тогда, когда ею можно пользоваться.
            Погашенная кнопка вне смены читалась поломкой; теперь вне
            смены на её месте стоит начало смены — см. StartShift. */}
        {canWrite && (
          <button className="btn btn-big" onClick={() => setStep('compose')}>
            {addLabel}
          </button>
        )}

        {saved && <Saved />}

        {/* Мойщик должен видеть, что его работа не потерялась, даже если
            связи нет прямо сейчас. Отвергнутые здесь не считаем: они не
            «ждут отправки», а ждут решения, и живут строками в журнале. */}
        {queued.length > 0 && (
          <div className="hint-warn">{t.work.waitingToSend(queued.length)}</div>
        )}

        {/* Журнал — прибор с подложкой, как списки в кабинете. Раньше он
            лежал прямо на полотне: строки висели в пустоте, а время и
            крестик уезжали к правому краю экрана, ни к чему не
            привязанные. */}
        {journal}
      </div>
    );
  }

  /* ----------------------------- запись ------------------------------ */
  /* Абонемент покрывает ОДНУ услугу, поэтому и предлагается только когда
     выбрана одна. При «комплекс + химчистка» списывать с него нечего:
     сервер посчитал бы всю запись по номиналу одной мойки внутри
     абонемента, и вторая услуга уехала бы бесплатно. */
  const single = chosen.length === 1 ? chosen[0] : null;
  const activePass = single
    ? known?.passes?.find((p) => p.serviceId === single.id)
    : undefined;
  /* Абонемент выбран, а клиент сменил услугу — списывать больше нечего.
     Считаем по факту, а не по тому, что было нажато минуту назад. */
  const usingPass = payment === 'pass' && Boolean(activePass);
  const ready = resolvedClientKey.length > 0 && chosen.length > 0 && payment !== null;
  const sum = usingPass ? t.payment.pass : formatMoney(charged, currency);

  /* Запись — на той же подложке, что журнал на её месте. Иначе при
     переходе с главной прибор исчезает, и форма висит на голом
     полотне: экран выглядит так, будто разметка сломалась. */
  return (
    <div className="grid content-start gap-[var(--seam)]">
      <div className="panel-pad rounded-[var(--radius-card)]" style={PANEL}>
        {/* Записалось — и форма осталась открытой. Строка стоит над
            номером, потому что глаз уже там: следующее движение —
            набрать следующую машину. */}
        {saved && <Saved className="mb-3" />}

        {/* Номер первым: сначала подъехала машина, потом решают, что с
            ней делают. */}
        <label className="grid gap-1.5">
          <span className="label">{clientIdLabel}</span>
          <input
            ref={inputRef}
            className="field field-key auth-field"
            value={clientKey}
            /* Пробел и дефис не принимаем вовсе, а не чиним потом при
               сохранении. Иначе человек видит на экране один вид, а в
               списке потом другой — и решает, что записалась не его
               машина. Номер один и выглядит одинаково везде с первой
               набранной буквы. */
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
        </label>

        {/* Узнавание постоянного прямо при наборе — то, ради чего экран и
            существует: мойщик видит, что машина уже была, до того как
            назовёт цену. */}
        {known && (
          <div className="hint-good mt-2">
            {t.work.knownClient(
              known.visits,
              agoLabel(known.lastSeenAt, t),
              formatMoney(known.total, currency, t.locale),
            )}
          </div>
        )}

        {/* Класс машины — сразу под номером и ВЫШЕ услуг.
            Класс принадлежит машине, а не услуге: «джип по комплексу,
            седан по химчистке» — не случай из жизни, а способ ошибиться.
            Выбирается один раз на заезд, и цены всех услуг ниже сразу
            пересчитываются. У мойки без тарифов ряда нет вовсе. */}
        {tiers.length > 0 && (
          <>
            <div className="label mt-4 mb-2">{tierLabel}</div>
            <div className="flex flex-wrap gap-2">
              {tiers.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  className="pick"
                  data-on={tier === i ? '' : undefined}
                  aria-pressed={tier === i}
                  onClick={() => setPicked(i)}
                >
                  <span className="pick-name">{name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="label mt-4 mb-2">{t.work.stepService}</div>
        {/* Услуги фишками, а не столбцом кнопок: их пять-шесть, названия
            разной длины, и в столбце они занимали пол-экрана — до оплаты
            приходилось листать. Повторное нажатие снимает выбор.

            Выбрать можно несколько: за один заезд делают комплекс и
            химчистку салона, и двумя машинами это записывать нельзя —
            число машин и средний чек выходят завышенными. */}
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const on = chosen.some((x) => x.id === s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="pick"
                data-on={on ? '' : undefined}
                aria-pressed={on}
                onClick={() => {
                  setChosen((cur) =>
                    on ? cur.filter((x) => x.id !== s.id) : [...cur, s],
                  );
                  /* Набор услуг сменился — абонемент был от прежнего.
                     Оставить его значило бы списать мойку, которой у
                     клиента на эти услуги нет. */
                  if (payment === 'pass') {
                    setPayment(null);
                    setPassId(null);
                  }
                }}
              >
                <span className="pick-name">{s.name}</span>
                {/* Цена та, которую сейчас возьмут: сменили класс — весь
                    ряд пересчитался. Прайс по классам иначе приходится
                    держать в голове. */}
                <span className="num pick-price">{formatMoney(priceOf(s), currency)}</span>
              </button>
            );
          })}
        </div>

        {/* Скидка.

            Свёрнута по умолчанию и стоит под услугами, а не полем цены
            наверху: скидка — исключение, и вводит её тот, кто её правда
            даёт, а не каждый по дороге. Больше прайса ввести нельзя, и
            это же правило стоит на сервере: запись фиксирует сумму, а не
            назначает её.

            До неё мойщик выбирал услугу подешевле или не записывал
            вовсе, и цифры расходились с кассой. */}
        {chosen.length > 0 && !usingPass && (
          <div className="mt-3">
            {showDiscount ? (
              <label className="flex items-center gap-2.5">
                <span className="label shrink-0">{t.work.discounted}</span>
                <input
                  className="field num !h-10 flex-1 text-end"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder={String(listTotal)}
                  autoComplete="off"
                />
              </label>
            ) : (
              <button
                type="button"
                className="btn-inline"
                onClick={() => setShowDiscount(true)}
              >
                {t.work.giveDiscount}
              </button>
            )}
          </div>
        )}

        {/* Кто мыл.

            Стоит между услугами и оплатой, потому что там же стоит в
            работе: машину приняли, решили что с ней делают, посмотрели
            кто взялся, взяли деньги. Выше оплаты ещё и потому, что
            меняет сумму зарплаты, а не сумму счёта: цифры под ним
            обязаны быть посчитаны до того, как палец уйдёт к последней
            кнопке.

            «Только я» — состояние по умолчанию, и это не мелочь: девять
            записей из десяти одиночные, и лишнее касание на них стоило
            бы сорок касаний за смену ради одного случая. Второй вариант
            открывает список коллег и ничего не меняет, пока в нём
            никого не отметили.

            Блока нет вовсе у бизнеса без общего процента и у точки, где
            человек один: и то и другое означает, что мыть вместе не с
            кем или не по чем, а управление, которое ничего не меняет,
            приходится прочитать, чтобы это понять. */}
        {canShare && (
          <div className="mt-4">
            <div className="label mb-2">{t.crew.who}</div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="pick"
                data-on={together ? undefined : ''}
                aria-pressed={!together}
                onClick={() => {
                  setTogether(false);
                  /* Отметки снимаем сразу. Оставленные «на потом» они не
                     видны — список свёрнут, — а уходят на сервер и делят
                     деньги молча. */
                  setHelpers([]);
                }}
              >
                <span className="pick-name">{t.crew.onlyMe}</span>
              </button>
              <button
                type="button"
                className="pick"
                data-on={together ? '' : undefined}
                aria-pressed={together}
                onClick={() => setTogether(true)}
              >
                <span className="pick-name">{t.crew.together}</span>
              </button>
            </div>

            {together && (
              <div className="mt-2.5">
                <div className="flex flex-wrap gap-2">
                  {working.map((m) => {
                    const on = crewIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="pick"
                        data-on={on ? '' : undefined}
                        aria-pressed={on}
                        /* Потолок стоит и здесь, и на сервере. Здесь —
                           чтобы отказ не прилетал после нажатия
                           «добавить», когда набирать заново придётся
                           всё. */
                        disabled={!on && crewSize >= MAX_CREW}
                        onClick={() =>
                          setHelpers((cur) =>
                            on ? cur.filter((id) => id !== m.id) : [...cur, m.id],
                          )
                        }
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: personColor(m.name) }}
                          aria-hidden
                        />
                        <span className="pick-name">{m.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Что получится — числами и до нажатия.

                    Это главное место всей затеи. Мойщик должен увидеть
                    СВОЮ долю раньше, чем согласится на совместную
                    запись, иначе вечером он узнает её из ведомости и
                    решит, что его обсчитали. Числа те же, что посчитает
                    сервер: общий код в `lib/crew.ts`.

                    Пока никого не отметили, стоит подсказка, а не
                    расчёт: «фонд 5 000, каждому 5 000» на одном
                    участнике — это не подсчёт, а способ запутать. */}
                {working.length === 0 ? (
                  /* Коллеги в бизнесе есть, но все вне смены. Молчать
                     здесь нельзя: пустой список читается как поломка, а
                     причина у него рабочая и поправимая — человеку надо
                     встать на смену на своём телефоне. */
                  <p className="hint-warn">{t.crew.nobodyOnShift}</p>
                ) : (
                  <div className="hint-good mt-2.5">
                    {crewIds.length === 0 ? (
                      t.crew.percentHint
                    ) : (
                      <>
                        <b>{staffCount(crewSize, staffRole, t.locale)}</b>
                        {' · '}
                        {t.crew.teamPercent} {split.percent}%
                        <br />
                        {t.crew.pool} <b className="num">{formatMoney(split.pool, currency)}</b>
                        {' · '}
                        {t.crew.yours}{' '}
                        <b className="num">{formatMoney(split.shares[0] ?? 0, currency)}</b>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Итог и оплата — низом, у большого пальца руки, которой держат
            телефон. */}
        <div className="mt-4 border-t pt-3.5" style={{ borderColor: 'var(--hairline)' }}>
          {/* Сумма появляется сразу после выбора услуги: считать в уме
              мойщик не должен, а сказать её клиенту должен вслух. */}
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px]" style={{ color: 'var(--board-muted)' }}>
              {t.work.toPay}
            </span>
            <span className="flex items-baseline gap-2">
              {/* Зачёркнутый прайс рядом со взятой суммой: без него
                  «4 000» не отличить от обычной цены, и скидку не видно
                  ни мойщику, ни тому, кто смотрит через плечо. */}
              {discounted && !usingPass && (
                <span
                  className="num text-[14px] line-through"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {formatMoney(listTotal, currency)}
                </span>
              )}
              <span
                className="num text-[24px] leading-none font-bold tracking-[-0.03em]"
                style={discounted && !usingPass ? { color: 'var(--warn-on-board)' } : undefined}
              >
                {sum}
              </span>
            </span>
          </div>

          <div className="label mb-2">{t.work.stepPayment}</div>

          {/* Абонемент идёт первым и во всю ширину: если он у клиента
              есть, брать деньги повторно — прямая ошибка. */}
          {activePass && (
            <button
              type="button"
              className="opt mb-2"
              data-on={usingPass ? '' : undefined}
              aria-pressed={usingPass}
              onClick={() => {
                setPayment('pass');
                setPassId(activePass.id);
              }}
            >
              <span className="flex items-center gap-2.5 font-semibold">
                <IconTicket className="size-[18px] shrink-0" />
                {t.payment.pass}
              </span>
              <span className="num">
                {t.passes.remaining} {activePass.remaining}
              </span>
            </button>
          )}

          <div className="grid grid-cols-3 gap-2">
            {payments(t).map((p) => (
              <button
                key={p.key}
                type="button"
                className="pay"
                data-on={payment === p.key ? '' : undefined}
                aria-pressed={payment === p.key}
                onClick={() => {
                  setPayment(p.key);
                  setPassId(null);
                }}
              >
                <p.Icon className="size-[18px]" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Последнее движение — и на нём написано, что произойдёт и за
            сколько. Пока номера, услуги или оплаты нет, кнопка погашена:
            неполную запись сервер и так не примет, но узнавать об этом
            из ошибки после нажатия — значит нажимать вслепую. */}
        <button
          type="button"
          className="btn btn-big mt-3.5"
          disabled={!ready || pending}
          onClick={submit}
        >
          {pending ? t.common.loading : t.work.addFor(unitOne, sum)}
        </button>

        {error && <p className="alert mt-2.5">{error}</p>}

        <button className="btn btn-ghost mt-2.5" disabled={pending} onClick={close}>
          {t.common.cancel}
        </button>
      </div>

      {/* Журнал остаётся на экране и во время записи: только что
          записанная машина появляется в нём сразу под формой, и это
          единственное подтверждение, которое мойщику нужно. */}
      {journal}
    </div>
  );
}

/* ------------------------------ мелочи ------------------------------ */

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

/**
 * «Записано» — строкой, а не экраном.
 *
 * Экран «готово» с галкой в кружке занимал место формы на полторы
 * секунды и всё это время не давал набрать следующую машину: очередь
 * ждала анимацию. Строка говорит то же самое, стоит там же, где глаз, и
 * ничего не закрывает — а подтверждение, которому мойщик верит, всё
 * равно другое: машина, появившаяся в журнале под формой.
 */
function Saved({ className = '' }: { className?: string }) {
  const t = useT();
  return (
    <p className={`saved-line ${className}`}>
      <IconCheck className="size-[15px] shrink-0" aria-hidden />
      {t.work.saved}
    </p>
  );
}
