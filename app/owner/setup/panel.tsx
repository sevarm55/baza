'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

import { hideSetup } from '@/app/onboarding-actions';
import { LoadingButton } from '@/components/loading';
import { Panel } from '@/components/patterns/panel';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Dict } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import type { SetupStepKey } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

/**
 * «Начало работы»: панель, а не баннер.
 *
 * Стоит первой на главной, пока настройка не закончена, и собрана из
 * того же, из чего вся остальная страница. Развёрнута ровно одна
 * строка, следующий шаг: у выполненных остаётся галочка и название, у
 * будущих название и тихий переход.
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

  /* Убрать блок: тихое действие в углу заголовка. Оно ничего не делает
     с бизнесом и не должно спорить по весу с тем, что делает; вернуть
     настройку всегда можно со своей страницы. */
  const dismiss = (
    <LoadingButton
      type="button"
      variant="ghost"
      size="xs"
      busy={hiding}
      label={complete ? t.setup.doneHide : t.setup.skip}
      busyLabel={t.common.updating}
      onClick={() => hide(async () => void (await hideSetup()))}
    />
  );

  if (complete) {
    const facts = [
      { name: t.setup.nextWork, note: t.setup.nextWorkNote },
      { name: t.setup.nextMoney, note: t.setup.nextMoneyNote },
      { name: t.setup.nextControl, note: t.setup.nextControlNote },
      { name: t.setup.nextReports, note: t.setup.nextReportsNote },
    ];

    return (
      <Panel title={t.setup.doneTitle} description={t.setup.doneNote} actions={dismiss}>
        {/* Что будет происходить дальше: последнее, что онбординг
            говорит владельцу, и говорит он не про кнопки, а про то, как
            теперь устроен его день. */}
        <p className="text-sm font-medium">{t.setup.nextTitle}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.name} className="rounded-md bg-muted/60 px-3 py-2.5">
              <dt className="text-sm font-medium">{fact.name}</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">{fact.note}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    );
  }

  const next = steps.find((s) => !s.done);
  const share = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Panel
      title={t.setup.title}
      description={t.setup.lead}
      padded={false}
      actions={
        <div className="flex items-center gap-3">
          {/* Полоса и число, оба тихие: число нужно, потому что полоса
              отвечает «примерно половина», а вопрос звучит «сколько
              осталось». */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="num text-xs text-muted-foreground">{t.setup.progress(done, total)}</span>
            <Progress
              value={share}
              aria-label={t.setup.progressAria}
              className="w-16 flex-nowrap"
            />
          </div>
          {dismiss}
        </div>
      }
    >
      <ol className="divide-y divide-border">
        {steps.map((step, i) => {
          const words = wordsFor(t, step.key);
          const now = step === next;
          return (
            <li
              key={step.key}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                step.done && 'text-muted-foreground',
              )}
            >
              {/* Номер до выполнения, галочка после: одного цвета для
                  этой разницы мало, продукт открывают и на солнце. */}
              <span
                aria-hidden
                className={cn(
                  'num flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-success-soft text-success-soft-foreground'
                    : now
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', !step.done && 'font-medium')}>{words.name}</p>
                {now && <p className="mt-0.5 text-xs text-muted-foreground">{words.note}</p>}
              </div>

              {/* Действие только у невыполненных: у сделанного шага
                  кнопка тянула бы обратно туда, откуда человек только
                  что вышел. */}
              {!step.done && (
                <Button
                  size="xs"
                  variant={now ? 'default' : 'outline'}
                  className="shrink-0"
                  render={<Link href={step.href} />}
                >
                  {words.cta}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/**
 * Слова шага. Отдельно от списка шагов нарочно: `lib/onboarding.ts`
 * знает, что выполнено, и не знает ни одного языка.
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
