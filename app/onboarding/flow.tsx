'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

import { useT } from '@/lib/i18n/client';
import { E, SPRING, SUCCESS_HOLD, T } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { finishFirstRun } from './actions';
import { StepServices, type ServiceItem } from './step-services';
import { StepExpense } from './step-expense';
import { StepStaff } from './step-staff';
import { StepMeet } from './step-meet';

/**
 * Оболочка сценария: прогресс, карточка шага, тихий выход.
 *
 * Сервер решает, С КАКОГО шага начать (по позиции и данным), а дальше
 * шаги сменяются на месте: после удачного действия — короткая отметка
 * «получилось» и следующий вопрос, без перезагрузок и поиска кнопки
 * «дальше». Обновление страницы безопасно: позиция уже записана, сервер
 * откроет сценарий там же.
 */

export type FlowWorker = { name: string; phone: string };

type StepNo = 1 | 2 | 3 | 4;

export function FirstRunFlow({
  step: initial,
  again = false,
  services,
  presets,
  currencySymbol,
  moneyStep,
  expenseHints,
  staffRole,
  defaultPercent,
  worker: knownWorker,
}: {
  step: StepNo;
  /** превью уже начиналось: шаг 4 говорит «продолжите», а не «посмотрите» */
  again?: boolean;
  services: ServiceItem[];
  presets: { name: string; price: number }[];
  currencySymbol: string;
  moneyStep: number;
  expenseHints: readonly string[];
  staffRole: string;
  defaultPercent: number;
  worker: FlowWorker | null;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<StepNo>(initial);
  const [flash, setFlash] = useState<string | null>(null);
  const [worker, setWorker] = useState<FlowWorker | null>(knownWorker);
  const [skipping, skip] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* Между шагами — отметка «получилось»: человек должен увидеть
     результат нажатия раньше, чем следующий вопрос. Держится ровно
     столько, сколько все успешные отметки продукта. */
  function advance(next: StepNo, note: string) {
    setFlash(note);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFlash(null);
      setStep(next);
    }, SUCCESS_HOLD);
  }

  const names: Record<StepNo, string> = {
    1: t.firstRun.nameServices,
    2: t.firstRun.nameExpense,
    3: t.firstRun.nameStaff,
    4: t.firstRun.namePreview,
  };

  /* Смена шага: лёгкий сдвиг и растворение. С выключенным движением —
     только растворение, быстрее. */
  const fade = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: T.fast },
      }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: T.normal, ease: E.standard },
      };

  return (
    <div className="flex flex-col gap-3">
      {/* Компактный прогресс: номер с именем шага и пять делений.
          Шаг 5 — финальный экран, его рисует сервер после машины. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <span className="num">{t.firstRun.stepOf(step, 5)}</span>
          {' · '}
          {names[step]}
        </p>
        <div
          role="progressbar"
          aria-label={t.firstRun.progressAria}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step}
          className="flex items-center gap-1"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1 w-5 rounded-full transition-colors sm:w-7',
                i <= step ? 'bg-primary' : 'bg-border',
              )}
            />
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <AnimatePresence mode="wait" initial={false}>
          {flash ? (
            <motion.div
              key="flash"
              {...fade}
              className="flex min-h-72 flex-col items-center justify-center gap-3 p-6"
            >
              <motion.span
                initial={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduced ? { duration: T.fast } : SPRING.snap}
                className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
              >
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </motion.span>
              <p className="text-sm font-medium">{flash}</p>
            </motion.div>
          ) : (
            <motion.div key={step} {...fade} className="p-5 sm:p-6">
              {step === 1 && (
                <StepServices
                  services={services}
                  presets={presets}
                  currencySymbol={currencySymbol}
                  moneyStep={moneyStep}
                  onDone={() => advance(2, t.firstRun.s1Done)}
                />
              )}
              {step === 2 && (
                <StepExpense
                  currencySymbol={currencySymbol}
                  hints={expenseHints}
                  onDone={() => advance(3, t.firstRun.s2Done)}
                />
              )}
              {step === 3 && (
                <StepStaff
                  defaultPercent={defaultPercent}
                  onDone={(made) => {
                    setWorker(made);
                    advance(4, t.firstRun.s3Done);
                  }}
                />
              )}
              {step === 4 && <StepMeet worker={worker} staffRole={staffRole} again={again} />}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Тихая дверь наружу: сценарий короткий, но запирать в нём
          нельзя. Закрывает его навсегда, как и финал. */}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          disabled={skipping}
          onClick={() => skip(async () => void (await finishFirstRun()))}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
        >
          {t.firstRun.later}
        </button>
      </div>
    </div>
  );
}
