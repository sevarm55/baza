'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import type { ActionResult } from '@/app/admin/actions';

/**
 * Опасное действие админки: подтверждение с обязательной причиной.
 *
 * Причина не формальность: она попадает в журнал и через год отвечает
 * на вопрос «зачем». Без неё кнопка не нажимается. Две кнопки подвала
 * одного размера, разница только в заливке.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  action,
  successMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  action: (reason: string) => Promise<ActionResult>;
  successMessage: string;
}) {
  const a = useA();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (reason.trim().length < 3) {
      setError(a.common.reasonRequired);
      return;
    }
    setError(null);
    start(async () => {
      const res = await action(reason.trim());
      if (res.ok) {
        toast.success(successMessage);
        setReason('');
        onOpenChange(false);
      } else {
        setError(res.error === 'reason' ? a.common.reasonRequired : a.common.error);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="reason">{a.common.reason}</FieldLabel>
          <Textarea
            id="reason"
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
        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {a.common.cancel}
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={submit} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
