'use client';

import { useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Eye } from 'lucide-react';

import { leaveWorkerPreview } from '@/app/onboarding/actions';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';
import { E, T } from '@/lib/motion';

/**
 * Плашка сценария над экраном смены — пока владелец смотрит на продукт
 * глазами работника.
 *
 * Экран под ней настоящий и ничем не отличается от того, что увидит
 * работник; плашка лишь называет мини-задачу и держит дверь обратно.
 * Никаких туров и стрелок: задач ровно две — открыть смену и записать
 * машину, — и обе делаются той же кнопкой, что и в жизни.
 */
export function FirstRunBar({ state }: { state: 'shift' | 'car' | 'done' }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [pending, start] = useTransition();

  const leave = () => {
    if (!pending) start(async () => void (await leaveWorkerPreview()));
  };

  const step = state === 'shift' ? 4 : 5;
  const done = state === 'done';

  const fade = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: T.fast },
      }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 6 },
        transition: { duration: T.normal, ease: E.standard },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div
          key="done"
          {...fade}
          className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-primary-foreground">
              <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-success-soft-foreground">
                {t.firstRun.barDone}
              </p>
              <p className="text-xs text-success-soft-foreground/80">
                <span className="num">{t.firstRun.stepOf(5, 5)}</span>
              </p>
            </div>
          </div>
          <LoadingButton
            type="button"
            size="sm"
            className="shrink-0"
            busy={pending}
            label={t.firstRun.barExit}
            busyLabel={t.common.loading}
            onClick={leave}
          />
        </motion.div>
      ) : (
        <motion.div
          key={state}
          {...fade}
          className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-primary-soft-foreground/80">
              <Eye className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {t.firstRun.barWatching} · <span className="num">{t.firstRun.stepOf(step, 5)}</span>
              </span>
            </p>
            <p className="mt-1 text-sm font-medium text-primary-soft-foreground">
              {state === 'shift' ? t.firstRun.barTaskShift : t.firstRun.barTaskCar}
            </p>
            <p className="text-xs text-primary-soft-foreground/80">
              {state === 'shift' ? t.firstRun.barTaskShiftNote : t.firstRun.barTaskCarNote}
            </p>
          </div>
          <LoadingButton
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 text-primary-soft-foreground"
            busy={pending}
            label={t.firstRun.barLeave}
            busyLabel={t.common.loading}
            onClick={leave}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
