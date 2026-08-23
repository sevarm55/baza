'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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
 * Первая минута владельца.
 *
 * Одно окно, один раз за всю жизнь бизнеса, и в нём ровно четыре вещи:
 * куда он попал, что от него нужно, что случится потом и с чего
 * начать. Ни тура по разделам, ни «шаг 1 из 14»: продукт приходит
 * настроенным. Окно, а не страница: под ним уже лежит его кабинет.
 */
export function Welcome({ nextHref }: { nextHref: string }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const marked = useRef(false);

  /* Отмечаем прочитанным при показе, а не при закрытии: окно, которое
     возвращается при каждом обновлении, перестаёт быть приветствием. */
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markWelcomeSeen();
  }, []);

  const steps = [
    { name: t.setup.flowSetup, note: t.setup.flowSetupNote },
    { name: t.setup.flowWork, note: t.setup.flowWorkNote },
    { name: t.setup.flowMoney, note: t.setup.flowMoneyNote },
    { name: t.setup.flowResult, note: t.setup.flowResultNote },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.setup.welcomeTitle}</DialogTitle>
          <DialogDescription>{t.setup.welcomeLead}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t.setup.welcomeNote}</p>

        {/* Путь бизнеса, а не список возможностей: четыре звена отвечают
            на вопрос, что будет происходить, если я это настрою. */}
        <ol className="flex flex-col gap-2.5">
          {steps.map((step, i) => (
            <li key={step.name} className="flex items-start gap-3">
              <span
                aria-hidden
                className="num mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{step.name}</span>
                <span className="block text-xs text-muted-foreground">{step.note}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* Два равноправных выхода одного размера: осмотреться сначала
            такой же нормальный ответ, как начать сразу. Разница только в
            заливке у того, который советуем. */}
        <DialogFooter className="grid grid-cols-2 sm:grid-cols-2 sm:justify-stretch">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.setup.welcomeLook}
          </Button>
          {/* Главное действие ведёт в настоящий раздел, а не на следующий
              экран мастера. */}
          <Button render={<Link href={nextHref} onClick={() => setOpen(false)} />}>
            {t.setup.welcomeStart}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
