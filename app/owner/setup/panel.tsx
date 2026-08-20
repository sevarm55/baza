'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Panel } from '@/components/board';
import { hideSetup } from '@/app/onboarding-actions';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import type { SetupStepKey } from '@/lib/onboarding';
import { LoadingButton } from '@/components/loading';

/**
 * «Начало работы» — прибор, а не баннер.
 *
 * Стоит первым на главной, пока настройка не закончена, и собран из того
 * же, из чего собрана вся остальная страница: подложка прибора,
 * заголовок с управлением в углу, строки со списком. Другого набора
 * деталей у онбординга нет намеренно — блок, нарисованный в собственном
 * стиле, читается рекламой внутри продукта, а не его частью.
 *
 * Развёрнута ровно одна строка — следующий шаг. У выполненных остаётся
 * галочка и название, у будущих — название и тихий переход. Показать
 * объяснение сразу у всех четырёх значило бы поставить на главную стену
 * текста в тот единственный день, когда человек ещё ничего про продукт
 * не знает и читать её не станет.
 */

export type PanelStep = { key: SetupStepKey; done: boolean; href: string };

export function SetupPanel({
  steps,
  done,
  total,
  complete,
}: {
  steps: PanelStep[];
  done: number;
  total: number;
  complete: boolean;
}) {
  const t = useT();
  const [hiding, hide] = useTransition();

  /* Убрать блок — тихое действие в углу заголовка, а не кнопка рядом с
     шагами. Оно ничего не делает с бизнесом и не должно спорить по весу
     с тем, что делает. Страшного подтверждения тоже нет: настройку
     всегда можно вернуть со своей страницы. */
  const dismiss = (
    <LoadingButton
      type="button"
      className="btn-inline btn-inline-danger"
      busy={hiding}
      label={complete ? t.setup.doneHide : t.setup.skip}
      busyLabel={t.common.updating}
      onClick={() => hide(async () => void (await hideSetup()))}
    />
  );

  if (complete) {
    return (
      <Panel title={t.setup.doneTitle} actions={dismiss} className="mb-[var(--seam)]">
        <p className="setup-lead">{t.setup.doneNote}</p>

        {/* Что будет происходить дальше — четыре строки, и ни одна не
            про кнопки. Это последнее, что онбординг говорит владельцу, и
            сказать он обязан не про интерфейс, а про то, как теперь
            устроен его день. */}
        <p className="setup-next-title">{t.setup.nextTitle}</p>
        <dl className="facts setup-next">
          <div>
            <dt>{t.setup.nextWork}</dt>
            <dd className="setup-next-note">{t.setup.nextWorkNote}</dd>
          </div>
          <div>
            <dt>{t.setup.nextMoney}</dt>
            <dd className="setup-next-note">{t.setup.nextMoneyNote}</dd>
          </div>
          <div>
            <dt>{t.setup.nextControl}</dt>
            <dd className="setup-next-note">{t.setup.nextControlNote}</dd>
          </div>
          <div>
            <dt>{t.setup.nextReports}</dt>
            <dd className="setup-next-note">{t.setup.nextReportsNote}</dd>
          </div>
        </dl>
      </Panel>
    );
  }

  const next = steps.find((s) => !s.done);

  return (
    <Panel
      title={t.setup.title}
      actions={
        <div className="setup-head-right">
          <Progress done={done} total={total} label={t.setup.progress(done, total)} />
          {dismiss}
        </div>
      }
      className="mb-[var(--seam)]"
    >
      <p className="setup-lead">{t.setup.lead}</p>

      <ol className="setup-steps">
        {steps.map((step, i) => {
          const words = wordsFor(t, step.key);
          const now = step === next;
          return (
            <li key={step.key} className="setup-step" data-done={step.done ? '' : undefined}>
              {/* Номер до выполнения, галочка после. Одного цвета для
                  этой разницы мало: продукт открывают и на солнце. */}
              <span className="setup-mark" aria-hidden>
                {step.done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>

              <div className="min-w-0">
                <p className="setup-name">{words.name}</p>
                {now && <p className="setup-note">{words.note}</p>}
              </div>

              {/* Действие есть только у невыполненных: у сделанного шага
                  кнопка «изменить название» тянула бы обратно туда,
                  откуда человек только что вышел. */}
              {!step.done && (
                <Link
                  href={step.href}
                  className={`btn-inline ${now ? 'btn-inline-primary' : ''} setup-go`}
                >
                  {words.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/**
 * Прогресс — полоса и число, оба тихие.
 *
 * Ни процентов, ни очков, ни поздравлений: это не игра, а список дел на
 * первый день. Число рядом с полосой нужно, потому что полоса без него
 * отвечает «примерно половина», а вопрос звучит «сколько осталось».
 */
function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const share = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="setup-progress">
      <span className="num setup-progress-text">{label}</span>
      <span
        className="setup-bar"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <i style={{ width: `${share}%` }} />
      </span>
    </span>
  );
}

/**
 * Слова шага.
 *
 * Отдельно от списка шагов нарочно: `lib/onboarding.ts` знает, что
 * выполнено, и не знает ни одного языка — иначе состояние бизнеса
 * пришлось бы считать заново для каждого словаря.
 */
function wordsFor(t: Dict, key: SetupStepKey): { name: string; note: string; cta: string } {
  if (key === 'business') {
    return {
      name: t.setup.stepBusiness,
      note: t.setup.stepBusinessNote,
      cta: t.setup.stepBusinessCta,
    };
  }
  if (key === 'services') {
    return {
      name: t.setup.stepServices,
      note: t.setup.stepServicesNote,
      cta: t.setup.stepServicesCta,
    };
  }
  if (key === 'staff') {
    return { name: t.setup.stepStaff, note: t.setup.stepStaffNote, cta: t.setup.stepStaffCta };
  }
  return { name: t.setup.stepFirst, note: t.setup.stepFirstNote, cta: t.setup.stepFirstCta };
}
