'use client';

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';
import { SPRING } from '@/lib/motion';
import { enterWorkerPreview } from './actions';
import type { FlowWorker } from './flow';

/**
 * Шаг 4: вход в режим работника.
 *
 * Ключевой момент сценария: вместо «выйдите и войдите под работником» —
 * одна кнопка. Сервер выпишет настоящую рабочую сессию поверх
 * владельческой (см. startWorkerPreview в lib/auth.ts) и уведёт на
 * настоящий экран смены; выход оттуда — одно нажатие на плашке.
 */
export function StepMeet({
  worker,
  staffRole,
  again,
}: {
  worker: FlowWorker | null;
  staffRole: string;
  /** превью уже начиналось: слова другие, действие то же */
  again: boolean;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function enter() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await enterWorkerPreview();
      /* Удача сюда не возвращается — сервер уводит на /work. */
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{t.firstRun.s4Title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {again ? t.firstRun.s4Again : t.firstRun.s4Note}
        </p>
      </header>

      {/* Карточка того, чьими глазами сейчас посмотрим: имя, роль и
          ключи входа. Код показан точками — он уже назначен и работает,
          а запоминать его владельцу не нужно. */}
      {worker && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0.17 } : SPRING.soft}
          className="rounded-md border border-border bg-muted/40 px-4 py-3.5"
        >
          <p className="text-sm font-medium">{worker.name}</p>
          <p className="text-xs text-muted-foreground">{staffRole}</p>
          <dl className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{t.auth.phone}</dt>
              <dd className="num">{worker.phone}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{t.auth.staffAccessCode}</dt>
              <dd className="num tracking-widest" aria-hidden>
                ••••••
              </dd>
            </div>
          </dl>
        </motion.div>
      )}

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <LoadingButton
        type="button"
        className="w-full"
        busy={pending}
        label={t.firstRun.s4Cta}
        busyLabel={t.common.loading}
        onClick={enter}
      />
    </div>
  );
}
