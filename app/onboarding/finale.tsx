'use client';

import { useTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';
import { E, SPRING, T } from '@/lib/motion';
import { finishFirstRun } from './actions';

/**
 * Финал сценария: результат глазами владельца.
 *
 * Не сводка и не список разделов — одна запись, которую человек только
 * что сделал руками работника, уже посчитанная продуктом. Это и есть
 * ответ на вопрос «как работает Tetrin»: работник записывает, владелец
 * видит. Кнопка внизу закрывает сценарий навсегда.
 */
export function Finale({
  lead,
  order,
}: {
  lead: string | null;
  order: {
    clientKey: string | null;
    serviceName: string;
    /** уже отформатированные сервером деньги и время */
    price: string;
    payment: string;
    time: string;
    author: string | null;
    role: string;
  };
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();

  const appear = (delay: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: T.fast } }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: T.normal, ease: E.standard, delay },
        };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
      <motion.span
        initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? { duration: T.fast } : SPRING.snap}
        className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
      >
        <Check className="size-7" strokeWidth={2.5} aria-hidden />
      </motion.span>

      <motion.div {...appear(0.1)}>
        <h1 className="text-xl font-semibold">{t.firstRun.fTitle}</h1>
        {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
      </motion.div>

      {/* Запись — как строка журнала: номер, услуга, деньги, кто и
          когда. Ровно это владелец будет видеть каждый день. */}
      <motion.div
        {...appear(0.22)}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 text-left"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-lg font-semibold">{order.clientKey ?? order.serviceName}</span>
          <span className="num text-lg font-semibold">{order.price}</span>
        </div>
        {order.clientKey && <p className="mt-0.5 text-sm">{order.serviceName}</p>}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <span className="truncate">
            {order.author ? `${order.author} · ${order.role}` : order.role}
          </span>
          <span className="num shrink-0">
            {order.payment} · {order.time}
          </span>
        </div>
      </motion.div>

      <motion.div {...appear(0.32)} className="flex w-full max-w-sm flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t.firstRun.fNote}</p>
        <LoadingButton
          type="button"
          className="w-full"
          busy={pending}
          label={t.firstRun.fCta}
          busyLabel={t.common.loading}
          onClick={() => {
            if (!pending) start(async () => void (await finishFirstRun()));
          }}
        />
      </motion.div>
    </div>
  );
}
