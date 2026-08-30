'use client';

import { useState, useTransition } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

import { issueTempAccessAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useA } from '@/lib/i18n/admin/client';

/**
 * Выдача временного кода доступа.
 *
 * Отдельным окном, а не в общем `ReasonDialog`: у этого действия есть
 * второй такт — показать сам код. Обычные опасные действия
 * заканчиваются тостом «сделано», а здесь тост бесполезен: код нужно
 * прочитать вслух в трубку, и окно обязано остаться открытым, пока его
 * не закрыли руками.
 *
 * Код показывается один раз и в базе лежит только хешем. Об этом
 * сказано прямо в окне: закрыл — выдавай новый.
 */
export function TempAccessDialog({
  open,
  onOpenChange,
  accountId,
  phone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  phone: string;
}) {
  const a = useA();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /** Выданный код. Пока null — окно спрашивает причину. */
  const [issued, setIssued] = useState<{ code: string; until: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    onOpenChange(false);
    /* Состояние чистится после закрытия, а не при открытии: иначе код
       успевает мелькнуть в закрывающемся окне. */
    setTimeout(() => {
      setIssued(null);
      setReason('');
      setError(null);
      setCopied(false);
    }, 200);
  };

  const submit = () => {
    if (reason.trim().length < 3) {
      setError(a.common.reasonRequired);
      return;
    }
    setError(null);
    start(async () => {
      const res = await issueTempAccessAction({ accountId, reason: reason.trim() });
      if (res.ok) {
        setIssued({ code: res.code, until: res.until });
        toast.success(a.users.tempAccessDone);
      } else {
        setError(res.error === 'reason' ? a.common.reasonRequired : a.common.error);
      }
    });
  };

  const until = issued
    ? new Date(issued.until).toLocaleString(undefined, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{a.users.tempAccessTitle(phone)}</AlertDialogTitle>
          <AlertDialogDescription>
            {issued ? a.users.tempAccessOnce : a.users.tempAccessNote}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {issued ? (
          <div className="flex flex-col gap-3">
            {/* Код крупно и табличными цифрами: его читают вслух в трубку,
                и «три-шесть» не должно превратиться в «тридцать шесть». */}
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
              <span className="num text-3xl font-bold tracking-[0.2em] tabular-nums">{issued.code}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.code);
                  setCopied(true);
                }}
              >
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? a.users.tempAccessCopied : a.users.tempAccessCopy}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {a.users.tempAccessCode} {until}
            </p>
          </div>
        ) : (
          <Field>
            <FieldLabel htmlFor="temp-reason">{a.common.reason}</FieldLabel>
            <Textarea
              id="temp-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={a.common.reasonPlaceholder}
              aria-invalid={!!error}
              disabled={pending}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </Field>
        )}

        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          {issued ? (
            <Button type="button" className="col-span-2" onClick={close}>
              {a.common.close}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                {a.common.cancel}
              </Button>
              <Button type="button" variant="destructive" onClick={submit} disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {a.users.tempAccess}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
