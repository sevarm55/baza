'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { markWelcomeSeen } from '@/app/onboarding-actions';
import { useT } from '@/lib/i18n/client';

/**
 * Первая минута мойщика.
 *
 * У него одна рабочая страница, и весь Tetrin ему объяснять не нужно —
 * ни отчёты, ни расходы, ни зарплатный лист он не откроет никогда. Нужно
 * три вещи в том порядке, в каком они случаются за смену: открыть,
 * записывать, закрыть.
 *
 * Никаких подсказок поверх кнопок после этого нет. Экран смены и так
 * состоит из одного действия за раз: вне смены на нём только «начать
 * смену», на смене — только запись. Объяснять нечего, если в каждый
 * момент видно ровно одно, что можно сделать.
 */
export function WorkerWelcome() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markWelcomeSeen();
  }, []);

  const steps = [t.setup.workerOne, t.setup.workerTwo, t.setup.workerThree];

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={t.setup.workerTitle}
      subtitle={t.setup.workerLead}
      footer={
        /* Одна кнопка и никакого «пропустить»: закрыть окно нечем, кроме
           как согласиться начать, — а согласие здесь ничего не обещает,
           под окном лежит тот же экран смены.

           Во всю ширину подвала, потому что она одна и её жмут мокрой
           рукой: половина подвала у единственного действия — это
           половина цели для пальца без всякой причины. */
        <div className="setup-foot">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            {t.setup.workerCta}
          </button>
        </div>
      }
    >
      <ol className="setup-steps setup-steps-plain">
        {steps.map((step, i) => (
          <li key={step} className="setup-step">
            <span className="setup-mark" aria-hidden>
              {i + 1}
            </span>
            <p className="setup-name">{step}</p>
          </li>
        ))}
      </ol>

      <p className="note">{t.setup.workerNote}</p>
    </Sheet>
  );
}
