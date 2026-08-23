'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { blockTenantAction, extendSubscriptionAction, saveTenantNoteAction, unblockTenantAction } from '@/app/admin/actions';
import { ReasonDialog } from '@/components/admin/reason-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRICE } from '@/lib/plan';
import { useA } from '@/lib/i18n/admin/client';

/**
 * Управление бизнесом из админки: продлить, отключить, заметка.
 *
 * Продление спрашивает сумму, а не берёт её из прайса: договариваются
 * по-разному, и записывать надо то, что было. Отключение и включение
 * требуют причину. Наблюдатель видит заметку и кнопок не видит.
 */
export function TenantActions({
  tenantId,
  name,
  blocked,
  note,
  canAct,
}: {
  tenantId: string;
  name: string;
  blocked: boolean;
  note: string | null;
  canAct: boolean;
}) {
  const a = useA();
  const [pending, start] = useTransition();
  const [extendOpen, setExtendOpen] = useState(false);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(String(PRICE));
  const [comment, setComment] = useState('');
  const [draftNote, setDraftNote] = useState(note ?? '');
  const [toggleOpen, setToggleOpen] = useState(false);

  const extend = () => {
    start(async () => {
      const res = await extendSubscriptionAction({ tenantId, months, amount: Number(amount), note: comment || undefined });
      if (res.ok) {
        toast.success(a.businesses.extended);
        setExtendOpen(false);
        setComment('');
      } else toast.error(a.common.error);
    });
  };

  const saveNote = () => {
    start(async () => {
      const res = await saveTenantNoteAction({ tenantId, note: draftNote });
      if (res.ok) toast.success(a.businesses.noteSaved);
      else toast.error(a.common.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="note">{a.businesses.note}</FieldLabel>
        <Textarea
          id="note"
          rows={3}
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder={a.businesses.notePlaceholder}
          disabled={!canAct || pending}
        />
      </Field>
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={saveNote} disabled={pending || draftNote === (note ?? '')}>
            {a.common.save}
          </Button>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setExtendOpen(true)} disabled={pending}>
            {a.businesses.extend}
          </Button>
          <Button size="sm" variant={blocked ? 'outline' : 'destructive-soft'} onClick={() => setToggleOpen(true)} disabled={pending}>
            {blocked ? a.businesses.unblock : a.businesses.block}
          </Button>
        </div>
      )}

      <Dialog open={extendOpen} onOpenChange={(o) => !pending && setExtendOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{a.businesses.extendTitle(name)}</DialogTitle>
            <DialogDescription className="sr-only">{a.businesses.extend}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="months">{a.businesses.months}</FieldLabel>
              <Input
                id="months"
                type="number"
                min={1}
                max={36}
                value={months}
                onChange={(e) => {
                  const m = Math.max(1, Math.min(36, Number(e.target.value) || 1));
                  setMonths(m);
                  setAmount(String(PRICE * m));
                }}
                className="num"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="amount">{a.businesses.amount}</FieldLabel>
              <Input id="amount" type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="comment">{a.businesses.comment}</FieldLabel>
            <Input id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setExtendOpen(false)} disabled={pending}>
              {a.common.cancel}
            </Button>
            <Button onClick={extend} disabled={pending || !Number.isInteger(Number(amount)) || Number(amount) < 0}>
              {pending && <Spinner data-icon="inline-start" />}
              {a.businesses.extend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={blocked ? a.businesses.unblock : a.businesses.blockTitle(name)}
        description={blocked ? undefined : a.businesses.blockNote}
        confirmLabel={blocked ? a.businesses.unblock : a.businesses.block}
        destructive={!blocked}
        action={(reason) => (blocked ? unblockTenantAction({ tenantId, reason }) : blockTenantAction({ tenantId, reason }))}
        successMessage={blocked ? a.businesses.unblocked : a.businesses.blocked}
      />
    </div>
  );
}
