'use client';

import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import {
  useCallback,
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
  enqueue,
  flushQueue,
  newRef,
  queueSnapshot,
  serverSnapshot,
  subscribe,
  type QueuedOrder,
} from '@/lib/offline';
import type { Payment } from '@/lib/orders';
import { hhmm } from '@/lib/time';
import { normalizeClientKey } from '@/lib/client-key';

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
 * Движение, отданное кнопке, возвращается на следующей машине: после
 * записи форма не закрывается, а очищается и снова ждёт номер. Мойщик
 * записывает машины подряд, а не по одной с возвратом на главную.
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
}) {
  const t = useT();
  const [wanted, setStep] = useState<Step>('home');
  const [clientKey, setClientKey] = useState('');
  const [service, setService] = useState<Service | null>(null);
  /** класс, который выбрал сам мойщик; null — ещё не трогал */
  const [picked, setPicked] = useState<number | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [passId, setPassId] = useState<string | null>(null);
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
          serviceId: item.serviceId,
          payment: item.payment,
          passId: item.passId,
          tier: item.tier,
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

  /** Очистить набранное, оставив форму открытой и курсор в номере. */
  const clear = useCallback(() => {
    setClientKey('');
    setService(null);
    setPayment(null);
    setPassId(null);
    setPicked(null);
    setKnown(null);
    setError(null);
    inputRef.current?.focus();
  }, []);

  function close() {
    setStep('home');
    setClientKey('');
    setService(null);
    setPayment(null);
    setPassId(null);
    setPicked(null);
    setKnown(null);
    setError(null);
  }

  /** Записалось: короткая строка вместо экрана «готово» — и следующий номер. */
  function succeed() {
    clear();
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  }

  function submit() {
    if (!service || !payment || !resolvedClientKey) return;
    if (sending.current) return;
    sending.current = true;
    setSaved(false);
    setError(null);

    const item: QueuedOrder = {
      ref: newRef(),
      clientKey: resolvedClientKey,
      serviceId: service.id,
      serviceName: service.name,
      price: priceOf(service),
      payment,
      passId: passId ?? undefined,
      /* Класс уходит словом, а не номером: пока запись лежит в очереди без
         связи, владелец мог переставить классы местами, и номер указал бы
         на соседний. Слово либо совпадёт, либо цена будет базовой. */
      tier: tier === null ? undefined : tiers[tier],
      at: Date.now(),
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
          serviceId: item.serviceId,
          payment: item.payment,
          passId: item.passId,
          tier: item.tier,
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
  const journal = (
    <Panel title={t.work.recent} count={recent.length + queue.length}>
      <div className="board-journal">
        {queue.map((q) => (
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
            const detail = [o.serviceName, paymentLabel(o.payment, t), hhmm(o.at, timezone)].join(
              ' · ',
            );
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
                <span className="num shrink-0 text-[14px] font-semibold">
                  {formatMoney(o.price, currency, t.locale)}
                </span>
                {/* Ошибся номером или услугой — исправляет сам, не бегая
                    к владельцу. Стоит последним и тихо: отменять
                    приходится одну запись из сорока. */}
                <RevokeOrder
                  orderId={o.id}
                  title={o.clientKey ?? o.serviceName}
                  detail={`${o.serviceName} · ${formatMoney(o.price, currency, t.locale)}`}
                />
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
            связи нет прямо сейчас. */}
        {queue.length > 0 && <div className="hint-warn">{t.work.waitingToSend(queue.length)}</div>}

        {/* Журнал — прибор с подложкой, как списки в кабинете. Раньше он
            лежал прямо на полотне: строки висели в пустоте, а время и
            крестик уезжали к правому краю экрана, ни к чему не
            привязанные. */}
        {journal}
      </div>
    );
  }

  /* ----------------------------- запись ------------------------------ */
  const activePass = service
    ? known?.passes?.find((p) => p.serviceId === service.id)
    : undefined;
  /* Абонемент выбран, а клиент сменил услугу — списывать больше нечего.
     Считаем по факту, а не по тому, что было нажато минуту назад. */
  const usingPass = payment === 'pass' && Boolean(activePass);
  const ready = resolvedClientKey.length > 0 && service !== null && payment !== null;
  const sum = usingPass
    ? t.payment.pass
    : formatMoney(service ? priceOf(service) : 0, currency);

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
            приходилось листать. Повторное нажатие снимает выбор. */}
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              className="pick"
              data-on={service?.id === s.id ? '' : undefined}
              aria-pressed={service?.id === s.id}
              onClick={() =>
                setService((cur) => {
                  const next = cur?.id === s.id ? null : s;
                  /* Услугу сменили — абонемент был от прежней. Оставить
                     его значило бы списать мойку, которой у клиента на
                     эту услугу нет. */
                  if (payment === 'pass') {
                    setPayment(null);
                    setPassId(null);
                  }
                  return next;
                })
              }
            >
              <span className="pick-name">{s.name}</span>
              {/* Цена та, которую сейчас возьмут: сменили класс — весь
                  ряд пересчитался. Прайс по классам иначе приходится
                  держать в голове. */}
              <span className="num pick-price">{formatMoney(priceOf(s), currency)}</span>
            </button>
          ))}
        </div>

        {/* Итог и оплата — низом, у большого пальца руки, которой держат
            телефон. */}
        <div className="mt-4 border-t pt-3.5" style={{ borderColor: 'var(--hairline)' }}>
          {/* Сумма появляется сразу после выбора услуги: считать в уме
              мойщик не должен, а сказать её клиенту должен вслух. */}
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px]" style={{ color: 'var(--board-muted)' }}>
              {t.work.toPay}
            </span>
            <span className="num text-[24px] leading-none font-bold tracking-[-0.03em]">{sum}</span>
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
