'use client';

import type { ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Подтверждение необратимого действия.
 *
 * Текст объясняет последствие, а не переспрашивает «вы уверены?».
 * Две кнопки одного размера: отмена и действие; у разрушительного
 * действия красная заливка. Пока запрос летит, окно не закрывается.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busyLabel,
  destructive = false,
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  busyLabel?: ReactNode;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  /** содержимое между описанием и кнопками: сумма, список людей */
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <AlertDialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      {/* Вопрос остаётся окном по центру и на телефоне: ровно так
          спрашивает приложение (`.alert`), и ровно так человек ждёт
          вопроса, на который надо ответить, прежде чем что-то
          произойдёт. Лист снизу для этого не годится — его закрывают
          движением, а вопрос закрывать движением нельзя. */}
      <AlertDialogContent className="sm:max-w-md max-md:rounded-m-box">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">{title}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="*:min-w-24 max-md:*:flex-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <LoadingButton
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            busy={busy}
            label={confirmLabel}
            busyLabel={busyLabel}
            onClick={() => void onConfirm()}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
