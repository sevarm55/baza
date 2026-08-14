'use client';

import { useTransition } from 'react';
import { Car, Check, Play } from 'lucide-react';
import { acceptJobAction, startJobAction } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export type QueueJob = {
  id: string;
  clientKey: string;
  serviceName: string | null;
  note: string | null;
  status: 'assigned' | 'accepted' | 'started';
  /** сколько стоит в очереди — уже строкой, считает сервер */
  waited: string;
};

/**
 * Машины, переданные мойщику.
 *
 * Стоит выше денег и выше кнопки записи — вопреки правилу «порядок по
 * частоте». Частота здесь ни при чём: когда машина назначена, это
 * единственная причина, по которой человек взял телефон в руки. Когда
 * назначенных нет, блок исчезает совсем и порядок экрана возвращается к
 * прежнему.
 *
 * Кнопка всегда одна. Два действия рядом заставляют выбирать, а выбора
 * тут нет: не взял — «Ընդունել», взял — «Սկսել». Следующий шаг человек
 * не ищет, он единственный на строке.
 */
export function JobQueue({ jobs, canWrite }: { jobs: QueueJob[]; canWrite: boolean }) {
  /* Начатая машина отсюда уходит.

     Блок наверху отвечает на один вопрос: что мне сейчас взять. Пока
     машина не взята — это ответ. Как только мойщик её начал, отвечать
     больше не на что: строка остаётся без единственной кнопки и висит
     мёртвым грузом над деньгами, а дальше человека ведёт запись внизу
     экрана — она же и закроет наряд.

     У владельца в очереди начатые остаются: ему как раз важно, что
     машина в работе, а не потерялась. */
  const waiting = jobs.filter((j) => j.status !== 'started');
  if (waiting.length === 0) return null;

  return (
    <section className="panel-pad rounded-[var(--radius-card)] grid gap-2.5">
      <h2 className="flex items-baseline gap-2 text-[14px] font-semibold tracking-[-0.01em]">
        {hy.jobs.mine}
        <span className="num text-[12.5px] font-normal" style={{ color: 'var(--board-muted)' }}>
          {waiting.length}
        </span>
      </h2>

      {waiting.map((job) => (
        <JobCard key={job.id} job={job} canWrite={canWrite} />
      ))}
    </section>
  );
}

function JobCard({ job, canWrite }: { job: QueueJob; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();

  /* Состояние читается словом, а не цветом: на мокром экране под
     ереванским солнцем оттенок плашки не различить, а слово видно. */
  const state =
    job.status === 'started' ? hy.jobs.washing : job.status === 'accepted' ? hy.jobs.accepted : hy.jobs.waiting;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-chip)]"
        style={{
          color: 'var(--tone-teal-glow)',
          background: 'color-mix(in srgb, var(--tone-teal-glow) 16%, transparent)',
        }}
        aria-hidden
      >
        <Car size={17} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="num block truncate text-[16px] font-bold tracking-[-0.01em]">
          {job.clientKey}
        </span>
        <span className="block truncate text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
          {[job.serviceName, state, job.waited].filter(Boolean).join(' · ')}
        </span>
      </span>

      {/* Пока запись невозможна — вне смены или без оплаченного доступа —
          кнопки нет вовсе. Погашенная кнопка без объяснения читается
          поломкой; её отсутствие не читается никак. */}
      {canWrite && job.status !== 'started' && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (job.status === 'assigned') await acceptJobAction(job.id);
              else await startJobAction(job.id);
            })
          }
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13.5px] font-semibold disabled:opacity-50"
          style={{ color: 'var(--accent-on)', background: 'var(--accent-fill)' }}
        >
          {job.status === 'assigned' ? <Check size={15} /> : <Play size={15} />}
          {job.status === 'assigned' ? hy.jobs.accept : hy.jobs.start}
        </button>
      )}
    </div>
  );
}
