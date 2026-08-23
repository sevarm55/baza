'use client';

import { useEffect, useRef, useState } from 'react';

import { markWelcomeSeen } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';

/**
 * Первая минута мойщика.
 *
 * У него одна рабочая страница, и весь Tetrin ему объяснять не нужно:
 * ни отчёты, ни расходы, ни зарплатный лист он не откроет никогда. Нужно
 * три вещи в том порядке, в каком они случаются за смену: открыть,
 * записывать, закрыть.
 *
 * Никаких подсказок поверх кнопок после этого нет. Экран смены и так
 * состоит из одного действия за раз: вне смены на нём только «начать
 * смену», на смене только запись.
 */
export function WorkerWelcome() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const marked = useRef(false);

  /* Отмечаем прочитанным при показе, а не при закрытии: окно, которое
     возвращается при каждом обновлении страницы, перестаёт быть
     приветствием и становится помехой. */
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markWelcomeSeen();
  }, []);

  const steps = [t.setup.workerOne, t.setup.workerTwo, t.setup.workerThree];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.setup.workerTitle}</DialogTitle>
          <DialogDescription>{t.setup.workerLead}</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span
                className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="text-sm font-medium">{step}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">{t.setup.workerNote}</p>

        {/* Одна кнопка во всю ширину и никакого «пропустить»: согласие
            здесь ничего не обещает, под окном лежит тот же экран смены. */}
        <DialogFooter>
          <Button type="button" size="lg" className="h-11 w-full" onClick={() => setOpen(false)}>
            {t.setup.workerCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
