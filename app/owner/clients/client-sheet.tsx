'use client';

import { useEffect, useState } from 'react';
import { History, MessageSquare, Phone } from 'lucide-react';
import { clientHistory, saveClientContact } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AsyncBoundary, LoadingButton } from '@/components/loading';
import { DetailList, DetailRow, LinkRow } from '@/components/patterns/detail-list';
import { EntitySheet } from '@/components/patterns/entity-sheet';
import { FormMessage, FormSection } from '@/components/patterns/form';
import { Metric } from '@/components/patterns/metric';
import { PersonDot } from '@/components/patterns/person';
import { EmptyState, SkeletonTable } from '@/components/patterns/states';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import { autoFocusOnDesktop } from '@/lib/autofocus';

type Loaded = Awaited<ReturnType<typeof clientHistory>>;

/**
 * Карточка машины.
 *
 * Список отвечает «кто это и сколько принёс». Следующий вопрос владельца
 * всегда один: что именно он у меня брал. Листом справа, а не переходом
 * на страницу: список длинный, и уход теряет место вместе с набранным
 * поиском и выбранным отбором.
 *
 * Данные приходят серверным действием по нажатию, а не грузятся вперёд
 * для всех строк: у мойки сотни машин, и история каждой — это сотни
 * запросов ради одного, который откроют.
 *
 * Привычки считаются здесь, из уже приехавшей истории: это те три
 * факта, из-за которых карточку и открывают перед разговором с клиентом.
 */
export function ClientSheet({
  plate,
  onClose,
  money,
  lostAfter,
}: {
  /** какая машина открыта; `null` — лист закрыт */
  plate: string | null;
  onClose: () => void;
  money: (n: number) => string;
  /** сколько дней молчания считается «пропал» */
  lostAfter: number;
}) {
  const t = useT();
  /* Загруженное хранится вместе с номером, для которого загружено: если
     номер в хранимом не совпадает с открытым, данных просто нет, и чужая
     история под новым номером показаться не может. Отказ хранится так
     же. */
  const [entry, setEntry] = useState<{ plate: string; data: Loaded } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const data = entry && entry.plate === plate ? entry.data : null;
  const error = failed !== null && failed === plate;
  const loading = plate !== null && data === null && !error;

  useEffect(() => {
    if (!plate) return;

    /* Ответ на закрытый или уже сменённый лист выбрасываем: два быстрых
       нажатия подряд могут вернуться в обратном порядке. */
    let alive = true;
    clientHistory(plate).then(
      (d) => {
        if (alive) setEntry({ plate, data: d });
      },
      () => {
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
  const last = c
    ? c.daysSince === 0
      ? t.owner.lastVisitToday
      : t.owner.lastVisitAgo(c.daysSince)
    : '';

  const service = topOf(orders.map((o) => o.serviceName));
  /* Кто чаще мыл эту машину: по участникам, а не по авторам записей.
     Совместную мойку записывает один, а работают все. */
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
    <EntitySheet
      open={plate !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      width="lg"
      title={<span className="num">{plate ?? ''}</span>}
      description={c ? `${c.visits} ${t.owner.visits} · ${t.owner.lastVisitPrefix} ${last}` : undefined}
    >
      <div className="flex flex-col gap-5">
        {/* Итог крупно: с ним сюда и заходят. Средний чек рядом и тише:
            он объясняет итог, а не спорит с ним. */}
        {c && (
          <Metric
            size="sm"
            label={t.owner.clientsTotalSpent}
            value={money(c.total)}
            hint={c.visits > 1 ? `${t.owner.clientAvg} ${money(avg)}` : undefined}
          />
        )}

        {/* Привычки. У приезжавшего один раз привычек нет: и «первый
            визит», и «обычно берёт» пересказали бы единственную строку
            истории ниже. */}
        {c && orders.length > 1 && (
          <DetailList>
            <DetailRow label={t.owner.clientFirstVisit} value={c.firstSeen} mono />
            {service && (
              <DetailRow label={t.owner.clientOftenTakes} value={<span className="truncate">{service}</span>} />
            )}
            {payment && <DetailRow label={t.owner.clientOftenPays} value={payment} />}
            {staff && (
              <DetailRow label={t.owner.clientOftenServed} value={<span className="truncate">{staff}</span>} />
            )}
          </DetailList>
        )}

        {/* Контакты и то, ради чего они заводятся: телефон при записи не
            спрашивают, он вписывается здесь, чтобы было куда звонить,
            когда человек пропал. */}
        {c && (
          <Contacts plate={c.key} name={c.name} phone={c.phone} lost={lost} onSaved={refresh} />
        )}

        <FormSection title={t.owner.clientHistory}>
          {/* Четыре разных ответа на один вопрос «что показывать»: место
              строк, пока едет; отказ с повтором; «пока пусто»; сама
              история. */}
          <AsyncBoundary
            loading={loading}
            error={error || undefined}
            empty={orders.length === 0}
            errorTitle={t.owner.clientHistoryFailed}
            onRetry={() => {
              setFailed(null);
              setAttempt((n) => n + 1);
            }}
            skeleton={<SkeletonTable rows={4} />}
            emptyState={<EmptyState compact title={t.common.empty} />}
          >
            <div className="flex flex-col divide-y divide-border">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.serviceName}</span>
                    <span className="num flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <PersonDot name={o.crew[0]?.name ?? o.staffName} />
                      <span className="truncate">
                        {crewNames(o)} · {paymentLabel(o.payment, t)} · {o.day} {o.time}
                      </span>
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">
                    {/* Скидка видна и здесь: постоянному её дают не один
                        раз, и «сколько всего оставил» без неё читается
                        неправдой в обе стороны. */}
                    {o.listPrice !== null && (
                      <span className="mr-1.5 font-normal text-muted-foreground line-through">
                        {money(o.listPrice)}
                      </span>
                    )}
                    {money(o.price)}
                  </span>
                </div>
              ))}
            </div>
          </AsyncBoundary>
        </FormSection>

        {plate && (
          <div className="rounded-lg border border-border">
            <LinkRow
              href={`/owner/clients/${encodeURIComponent(plate)}`}
              title={t.owner.openClient}
              note={t.owner.clientHistory}
              icon={<History />}
            />
          </div>
        )}
      </div>
    </EntitySheet>
  );
}

/**
 * Что встречается чаще всего. Пусто, когда выбирать не из чего:
 * «обычно берёт комплекс» после единственного визита — не привычка, а
 * пересказ той же строки.
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
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{t.owner.clientContacts}</div>
            <div className="mt-0.5 truncate text-sm font-semibold">{name || plate}</div>
            <div className="num text-xs text-muted-foreground">
              {phone ? formatPhone(phone) : t.owner.clientNoPhone}
            </div>
          </div>
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            {t.common.edit}
          </Button>
        </div>

        {phone && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${phone}`} />}>
              <Phone data-icon="inline-start" aria-hidden />
              {t.owner.clientCall}
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`sms:${phone}`} />}>
              <MessageSquare data-icon="inline-start" aria-hidden />
              {t.owner.clientWrite}
            </Button>
          </div>
        )}

        {/* Подсказка только пропавшему: у того, кто был вчера, она
            превращается в фон, который перестают замечать. */}
        {lost && <FormMessage tone="info">{t.owner.clientLostHint}</FormMessage>}
      </div>
    );
  }

  return (
    <form
      /* Ключом стоит номер машины: при переходе к другой поля обязаны
         сброситься, а не донести чужое имя и чужой телефон. */
      key={plate}
      className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4"
      /* Enter в поле имени отправляет форму мимо кнопки, поэтому засов
         стоит и здесь, а не только на ней. */
      onSubmit={(e) => {
        if (saving) e.preventDefault();
      }}
      action={async (form: FormData) => {
        if (saving) return;
        setSaving(true);
        try {
          await saveClientContact(plate, String(form.get('name') ?? ''), String(form.get('phone') ?? ''));
          /* Сначала перечитать, потом закрыть форму: иначе человек на
             мгновение увидит старое значение под новой формой. */
          await onSaved();
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="client-name">{t.owner.clientName}</FieldLabel>
        <Input
          id="client-name"
          name="name"
          defaultValue={name ?? ''}
          autoComplete="off"
          autoFocus={autoFocusOnDesktop()}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="client-phone">{t.owner.clientPhone}</FieldLabel>
        <Input
          id="client-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone ?? ''}
          placeholder="+374 77 123 456"
          autoComplete="off"
          className="num"
        />
      </Field>

      <div className="flex items-center gap-2">
        <LoadingButton size="sm" busy={saving} label={t.settings.save} busyLabel={t.common.saving} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
          {t.common.cancel}
        </Button>
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
 * Кто мыл — одной строкой. Все участники, а не автор записи: совместную
 * мойку вносит один человек, а работают несколько.
 */
function crewNames(order: { crew: { name: string | null }[]; staffName: string | null }): string {
  const names = order.crew.map((p) => p.name).filter((n): n is string => Boolean(n));
  if (names.length > 0) return names.join(' · ');
  return order.staffName ?? '—';
}
