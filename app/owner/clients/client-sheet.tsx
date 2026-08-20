'use client';

import { useEffect, useState } from 'react';
import { clientHistory, saveClientContact } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { personColor } from '@/lib/person-color';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import { AsyncBoundary, LoadingButton, SkeletonList, SkeletonText } from '@/components/loading';

type History = Awaited<ReturnType<typeof clientHistory>>;

/**
 * Карточка машины.
 *
 * Список отвечает «кто это и сколько принёс». Следующий вопрос владельца
 * всегда один и тот же: **что именно он у меня брал** — и без ответа
 * строка списка тупик, а список превращается в счётчик, по которому
 * ничего нельзя решить.
 *
 * Панелью справа, а не переходом на страницу: список клиентов длинный, и
 * уход теряет место, на котором человек стоял, вместе с набранным
 * поиском и выбранным отбором. Закрыл — продолжил с той же строки.
 *
 * Данные приходят серверным действием по нажатию, а не грузятся вперёд
 * для всех строк: у мойки сотни машин, и история каждой — это сотни
 * запросов ради одного, который откроют.
 *
 * Привычки — любимая услуга, обычный способ оплаты, кто чаще обслуживает —
 * считаются здесь, из уже приехавшей истории, а не отдельными запросами.
 * Это те три факта, из-за которых карточку и открывают перед разговором
 * с клиентом.
 */
export function ClientSheet({
  plate,
  onClose,
  money,
  lostAfter,
}: {
  /** какая машина открыта; `null` — панель закрыта */
  plate: string | null;
  onClose: () => void;
  money: (n: number) => string;
  /** сколько дней молчания считается «пропал» */
  lostAfter: number;
}) {
  const t = useT();
  /* Загруженное хранится ВМЕСТЕ с номером, для которого загружено: если
     номер в хранимом не совпадает с открытым, данных просто нет, и
     чужая история под новым номером показаться не может. Сверка идёт
     при отрисовке, без сброса состояния и без лишнего кадра. */
  const [entry, setEntry] = useState<{ plate: string; data: History } | null>(null);
  /* Отказ хранится вместе с номером по той же причине, что и данные:
     ошибка на прошлой машине не должна встречать того, кто открыл
     следующую. */
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const data = entry && entry.plate === plate ? entry.data : null;
  const error = failed !== null && failed === plate;
  const loading = plate !== null && data === null && !error;

  useEffect(() => {
    if (!plate) return;

    /* Ответ на закрытую или уже сменённую панель выбрасываем: два
       быстрых нажатия подряд могут вернуться в обратном порядке, и
       поздний ответ на ранний номер затёр бы правильный. */
    /* Отказ сбрасывать не нужно: он хранится вместе с номером, и на
       чужом номере `failed === plate` и так ложь. */
    let alive = true;
    clientHistory(plate).then(
      (d) => {
        if (alive) setEntry({ plate, data: d });
      },
      () => {
        /* Без этой ветки отказ оставлял панель в вечной загрузке:
           обещание, что история сейчас появится, не выполнялось никогда,
           и закрыть панель было единственным выходом. */
        if (alive) setFailed(plate);
      },
    );
    return () => {
      alive = false;
    };
  }, [plate, attempt]);

  async function refresh() {
    if (!plate) return;
    setEntry({ plate, data: await clientHistory(plate) });
  }

  const c = data?.client;
  const orders = data?.orders ?? [];
  const avg = c && c.visits > 0 ? Math.round(c.total / c.visits) : 0;
  const lost = c ? c.daysSince > lostAfter : false;

  const service = topOf(orders.map((o) => o.serviceName));
  /* Кто чаще мыл эту машину. Считаем по участникам, а не по
     авторам записей: совместную мойку записывает один, а работают все,
     и «чаще всего мыл Арман» по авторству назвало бы того, у кого
     телефон под рукой. */
  const staff = topOf(
    orders.flatMap((o) =>
      o.crew.length > 0
        ? o.crew.map((p) => p.name).filter((n): n is string => Boolean(n))
        : o.staffName
          ? [o.staffName]
          : [],
    ),
  );
  const payment = topOf(orders.map((o) => paymentLabel(o.payment, t)));

  return (
    <Sheet
      open={plate !== null}
      onClose={onClose}
      side
      title={plate ?? ''}
      subtitle={
        c
          ? `${c.visits} ${t.owner.visits} · ${t.owner.lastVisitPrefix} ${
              c.daysSince === 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(c.daysSince)
            }`
          : undefined
      }
    >
      {/* Итог отдельной строкой и крупно: с ним сюда и заходят —
          «сколько эта машина мне принесла». Средний чек рядом и тише:
          он объясняет итог, а не спорит с ним. */}
      {c && (
        <div className="client-total">
          <span className="client-total-label">{t.owner.clientsTotalSpent}</span>
          <span className="num client-total-value">{money(c.total)}</span>
          {c.visits > 1 && (
            <span className="num client-total-note">
              {t.owner.clientAvg} {money(avg)}
            </span>
          )}
        </div>
      )}

      {/* Привычки клиента. Три факта, из-за которых карточку открывают
          перед разговором: давно ли он тут, что берёт и кто его знает.

          У приезжавшего один раз привычек нет: и «первый визит», и
          «обычно берёт» пересказали бы ту единственную строку, что
          стоит ниже. */}
      {c && orders.length > 1 && (
        <dl className="facts mt-3.5">
          <div>
            <dt>{t.owner.clientFirstVisit}</dt>
            <dd className="num">{c.firstSeen}</dd>
          </div>
          {service && (
            <div>
              <dt>{t.owner.clientOftenTakes}</dt>
              <dd className="truncate" title={service}>
                {service}
              </dd>
            </div>
          )}
          {payment && (
            <div>
              <dt>{t.owner.clientOftenPays}</dt>
              <dd>{payment}</dd>
            </div>
          )}
          {staff && (
            <div>
              <dt>{t.owner.clientOftenServed}</dt>
              <dd className="truncate" title={staff}>
                {staff}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* Контакты и то, ради чего они заводятся.

          Телефон при записи машины не спрашивают и не будут: мойщик
          вводит номер, услугу и оплату мокрыми руками, с очередью за
          спиной. Владелец же заходит в карточку постоянного спокойно —
          вот здесь номер и вписывается, чтобы потом было куда звонить,
          когда человек пропал. */}
      {c && (
        <Contacts plate={c.key} name={c.name} phone={c.phone} lost={lost} onSaved={refresh} />
      )}

      {/* Четыре разных ответа на один вопрос «что показывать»: место
          строк, пока едет; отказ с повтором, если не доехало; «пока
          пусто», если приехал пустой список; и сама история.

          Пустой список и «ещё не приехало» здесь особенно легко
          спутать: и то и другое выглядит как машина без визитов, а
          значат они противоположное. */}
      <AsyncBoundary
        loading={loading}
        error={error || undefined}
        empty={orders.length === 0}
        errorTitle={t.owner.clientHistoryFailed}
        onRetry={() => {
          setFailed(null);
          setAttempt((n) => n + 1);
        }}
        skeleton={
          <div className="mt-4 grid gap-3.5">
            <SkeletonText className="h-3 w-28" />
            <SkeletonList rows={4} />
          </div>
        }
        emptyState={
          <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
            {t.common.empty}
          </p>
        }
      >
        <>
          <h3 className="mt-4 mb-1 text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>
            {t.owner.clientHistory}
          </h3>
          <div className="board-journal">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-2.5 px-0.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{o.serviceName}</span>
                  <span
                    className="num flex items-center gap-1.5 truncate text-[12px]"
                    style={{ color: 'var(--muted)' }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: personColor(o.crew[0]?.name ?? o.staffName) }}
                      aria-hidden
                    />
                    {crewNames(o)} · {paymentLabel(o.payment, t)} · {o.day} {o.time}
                  </span>
                </span>
                <span className="num shrink-0 text-[14px] font-semibold">
                  {/* Скидка видна и здесь: постоянному её дают не один
                      раз, и «сколько всего оставил» без неё читается
                      неправдой в обе стороны. */}
                  {o.listPrice !== null && (
                    <span className="op-list-price">{money(o.listPrice)}</span>
                  )}
                  {money(o.price)}
                </span>
              </div>
            ))}
          </div>
        </>
      </AsyncBoundary>
    </Sheet>
  );
}

/**
 * Что встречается чаще всего.
 *
 * Считается из уже приехавшей истории, а не отдельным запросом: список
 * визитов и так лежит перед глазами, и спрашивать базу второй раз ради
 * подсчёта по нему значило бы платить запросом за арифметику.
 *
 * Пусто, когда выбирать не из чего: «обычно берёт комплекс» после
 * единственного визита — это не привычка, а пересказ той же строки.
 */
function topOf(values: string[]): string | null {
  if (values.length < 2) return null;

  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);

  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? null;
}

/** Имя, телефон и две кнопки к нему. */
function Contacts({
  plate,
  name,
  phone,
  lost,
  onSaved,
}: {
  plate: string;
  name: string | null;
  phone: string | null;
  lost: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div
        className="mt-3.5 rounded-[var(--radius-card)] p-4"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
              {t.owner.clientContacts}
            </div>
            <div className="mt-1 truncate text-[15px] font-semibold">{name || plate}</div>
            <div className="num mt-0.5 text-[13px]" style={{ color: 'var(--muted)' }}>
              {phone ? formatPhone(phone) : t.owner.clientNoPhone}
            </div>
          </div>

          <button type="button" className="btn-inline" onClick={() => setEditing(true)}>
            {t.common.edit}
          </button>
        </div>

        {phone && (
          <div className="mt-3 flex gap-2">
            <a className="btn-inline btn-inline-primary" href={`tel:${phone}`}>
              {t.owner.clientCall}
            </a>
            <a className="btn-inline" href={`sms:${phone}`}>
              {t.owner.clientWrite}
            </a>
          </div>
        )}

        {/* Подсказка только пропавшему: у того, кто был вчера, она
            превращается в фон, который перестают замечать, — и не
            сработает в тот день, когда понадобится. */}
        {lost && <p className="signal mt-3">{t.owner.clientLostHint}</p>}
      </div>
    );
  }

  return (
    <form
      /* Ключом стоит номер машины: у неё своё имя и свой телефон, и при
         переходе к другой поля обязаны сброситься, а не донести чужое. */
      key={plate}
      className="mt-3.5 grid gap-2.5 rounded-[var(--radius-card)] p-4"
      /* Поля внутри карточки — светлее её, а не того же тона: правило
         одно на весь продукт, поле не совпадает с подложкой. */
      style={{
        background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)',
        ['--field-fill' as string]: 'var(--board-surface)',
      }}
      /* Enter в поле имени отправляет форму мимо кнопки, поэтому засов
         стоит и здесь, а не только на ней. */
      onSubmit={(e) => {
        if (saving) e.preventDefault();
      }}
      action={async (form: FormData) => {
        if (saving) return;
        setSaving(true);
        try {
          await saveClientContact(
            plate,
            String(form.get('name') ?? ''),
            String(form.get('phone') ?? ''),
          );
          /* Сначала перечитать, потом закрыть форму: закрой раньше — и
             человек на мгновение увидит старое значение под новой формой,
             то есть ровно то, чего он и боится, нажимая «сохранить». */
          await onSaved();
          setEditing(false);
        } finally {
          /* Иначе отказ сервера оставлял кнопку занятой навсегда: форма
             выглядела как отправляющаяся и не отвечала ни на одно
             нажатие, и единственным выходом была перезагрузка. */
          setSaving(false);
        }
      }}
    >
      <label className="grid gap-1.5">
        <span className="label">{t.owner.clientName}</span>
        <input className="field" name="name" defaultValue={name ?? ''} autoFocus />
      </label>

      <label className="grid gap-1.5">
        <span className="label">{t.owner.clientPhone}</span>
        <input
          className="field num"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone ?? ''}
          placeholder="+374 77 123 456"
        />
      </label>

      <div className="mt-1 flex gap-2">
        <LoadingButton
          className="btn-inline btn-inline-primary"
          busy={saving}
          label={t.settings.save}
          busyLabel={t.common.saving}
        />
        <button
          type="button"
          className="btn-inline"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

/**
 * Кто мыл — одной строкой.
 *
 * Все участники, а не автор записи: совместную мойку вносит один
 * человек, а работают несколько, и назвать одного значило бы соврать про
 * остальных. У одиночной записи участник ровно один, и строка выглядит
 * ровно как выглядела.
 */
function crewNames(order: { crew: { name: string | null }[]; staffName: string | null }): string {
  const names = order.crew.map((p) => p.name).filter((n): n is string => Boolean(n));
  if (names.length > 0) return names.join(' · ');
  return order.staffName ?? '—';
}
