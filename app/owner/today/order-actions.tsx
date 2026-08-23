'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, UserRound, Users, X } from 'lucide-react';

import { revokeOrder, saveOrderCrew } from '@/app/actions';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { PersonDot } from '@/components/patterns/person';
import { RowActions } from '@/components/patterns/row-actions';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Меню записи: открыть клиента, скопировать номер, изменить состав,
 * отменить. Отмена переспрашивается окном с объяснением, а не вторым
 * нажатием в меню.
 */
export function OrderActions({
  orderId,
  clientKey,
  crew = [],
  staff = [],
  teamPercent = null,
  detail,
}: {
  orderId: string;
  clientKey?: string | null;
  crew?: { staffId: string | null }[];
  staff?: { id: string; name: string }[];
  teamPercent?: number | null;
  /** «услуга · цена» для окна отмены */
  detail?: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);

  /* Буфер обмена из меню отказывает молча, когда фокус у меню;
     старый `execCommand` остаётся запасным. */
  async function copyKey() {
    if (!clientKey) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(clientKey);
      ok = true;
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = clientKey;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(field);
        field.select();
        ok = document.execCommand('copy');
        field.remove();
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  /* Правка состава возможна, когда совместная работа включена и людей
     больше одного. */
  const canEditCrew = teamPercent !== null && staff.length > 1;

  return (
    <>
      <RowActions
        label={t.owner.rowActions}
        size="icon-xs"
        actions={[
          ...(clientKey
            ? [
                {
                  key: 'open',
                  label: t.owner.openClient,
                  icon: <UserRound aria-hidden />,
                  href: `/owner/clients/${encodeURIComponent(clientKey)}`,
                },
                {
                  key: 'copy',
                  label: <span className="num">{copied ? t.owner.copiedKey : clientKey}</span>,
                  icon: copied ? <Check aria-hidden /> : <Copy aria-hidden />,
                  onSelect: () => void copyKey(),
                },
              ]
            : []),
          ...(canEditCrew
            ? [
                {
                  key: 'crew',
                  label: t.crew.edit,
                  icon: <Users aria-hidden />,
                  onSelect: () => setEditing(true),
                  separator: !!clientKey,
                },
              ]
            : []),
          {
            key: 'cancel',
            label: t.owner.cancelOrder,
            icon: <X aria-hidden />,
            destructive: true,
            separator: true,
            onSelect: () => setAsking(true),
          },
        ]}
      />

      <ConfirmDialog
        open={asking}
        onOpenChange={(next) => !pending && setAsking(next)}
        title={t.owner.confirmCancel}
        description={[clientKey, detail].filter(Boolean).join(' · ') || undefined}
        destructive
        busy={pending}
        confirmLabel={t.owner.cancelOrder}
        busyLabel={t.common.deleting}
        onConfirm={() =>
          startTransition(async () => {
            await revokeOrder(orderId);
            setAsking(false);
          })
        }
      />

      {editing && (
        <CrewSheet
          orderId={orderId}
          title={clientKey ?? ''}
          staff={staff}
          current={crew.map((p) => p.staffId).filter((id): id is string => Boolean(id))}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

/**
 * Состав бригады: кто мыл эту машину. Добавление человека делит тот же
 * фонд на большее число, а не пересчитывает его: ставка лежит снимком
 * в записи.
 */
function CrewSheet({
  orderId,
  title,
  staff,
  current,
  onClose,
}: {
  orderId: string;
  title: string;
  staff: { id: string; name: string }[];
  current: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const state = await saveOrderCrew(orderId, chosen);
      if (state?.error) {
        setError(state.error);
        return;
      }
      onClose();
    });
  }

  return (
    <EntitySheet
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={t.crew.edit}
      description={title || t.crew.editLead}
      footer={
        <SheetActions>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <LoadingButton
            type="button"
            busy={pending}
            disabled={chosen.length === 0}
            label={t.common.save}
            busyLabel={t.common.saving}
            onClick={save}
          />
        </SheetActions>
      }
    >
      <div className="flex flex-wrap gap-2">
        {staff.map((s) => {
          const on = chosen.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setChosen((cur) => (on ? cur.filter((id) => id !== s.id) : [...cur, s.id]))
              }
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                on
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              <PersonDot name={s.name} />
              {s.name}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t.crew.percentHint}</p>
      {error && <FormMessage className="mt-3">{error}</FormMessage>}
    </EntitySheet>
  );
}
