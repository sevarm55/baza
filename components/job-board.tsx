'use client';

import { useState, useTransition } from 'react';
import { Car, Plus, X } from 'lucide-react';
import { Sheet } from '@/components/sheet';
import { assignJobAction, cancelJobAction } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export type BoardJob = {
  id: string;
  clientKey: string;
  staffName: string | null;
  serviceName: string | null;
  status: 'assigned' | 'accepted' | 'started';
  waited: string;
};

export type Assignee = { id: string; name: string };
export type Offer = { id: string; name: string };

/**
 * Очередь мойки в кабинете: кто что моет прямо сейчас.
 *
 * Владелец видел только результат — вымытые машины за день. Что стоит
 * во дворе и кто чем занят, продукт не знал вовсе: это жило в голове
 * владельца и в криках через двор. Здесь очередь становится предметом,
 * на который можно посмотреть.
 *
 * Порядок строго по времени приёма, а не по состоянию: очередь есть
 * очередь. Машина, которая стоит дольше всех, обязана быть первой
 * строкой, даже если её уже моют, — иначе по списку нельзя ответить на
 * единственный вопрос, ради которого в него смотрят: кто ждёт дольше
 * всех.
 */
export function JobBoard({
  jobs,
  staff,
  services,
  unitOne,
  clientIdLabel,
}: {
  jobs: BoardJob[];
  staff: Assignee[];
  services: Offer[];
  unitOne: string;
  clientIdLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel-pad rounded-[var(--radius-card)] grid gap-3">
      <div className="flex min-h-[1.75rem] items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-[14px] font-semibold tracking-[-0.01em]">
          {hy.jobs.queue}
          <span className="num text-[12.5px] font-normal" style={{ color: 'var(--board-muted)' }}>
            {jobs.length}
          </span>
        </h2>

        {/* Приём машины — единственное действие этого прибора, поэтому
            оно стоит в его заголовке, а не отдельной кнопкой под
            списком: там его пришлось бы искать под пустотой, когда
            очередь пуста. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={staff.length === 0}
          className="btn-inline"
        >
          <Plus size={15} aria-hidden />
          {hy.jobs.assign}
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="py-6 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {hy.jobs.empty}
        </p>
      ) : (
        <div className="grid gap-2">
          {jobs.map((job) => (
            <Row key={job.id} job={job} />
          ))}
        </div>
      )}

      <AssignSheet
        open={open}
        onClose={() => setOpen(false)}
        staff={staff}
        services={services}
        unitOne={unitOne}
        clientIdLabel={clientIdLabel}
      />
    </section>
  );
}

function Row({ job }: { job: BoardJob }) {
  const [pending, startTransition] = useTransition();

  const state =
    job.status === 'started' ? hy.jobs.washing : job.status === 'accepted' ? hy.jobs.accepted : hy.jobs.waiting;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-chip)]"
        style={{
          color: job.status === 'started' ? 'var(--tone-lime)' : 'var(--tone-teal-glow)',
          background:
            job.status === 'started'
              ? 'color-mix(in srgb, var(--tone-lime) 18%, transparent)'
              : 'color-mix(in srgb, var(--tone-teal-glow) 16%, transparent)',
        }}
        aria-hidden
      >
        <Car size={15} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="num block truncate text-[14.5px] font-semibold">{job.clientKey}</span>
        <span className="block truncate text-[12px]" style={{ color: 'var(--board-muted)' }}>
          {[job.staffName, job.serviceName].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className="shrink-0 text-end">
        <span className="block text-[12.5px] font-medium">{state}</span>
        <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
          {job.waited}
        </span>
      </span>

      {/* Снять с очереди может только владелец: машина уехала, не
          дождавшись, — это его решение, а не мойщика, которому просто
          не хочется её мыть. */}
      <button
        type="button"
        disabled={pending}
        title={hy.jobs.cancel}
        aria-label={hy.jobs.cancel}
        onClick={() => startTransition(async () => void (await cancelJobAction(job.id)))}
        className="flex size-7 shrink-0 items-center justify-center rounded-[6px] transition hover:bg-surface2 disabled:opacity-40"
        style={{ color: 'var(--board-muted)' }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function AssignSheet({
  open,
  onClose,
  staff,
  services,
  unitOne,
  clientIdLabel,
}: {
  open: boolean;
  onClose: () => void;
  staff: Assignee[];
  services: Offer[];
  unitOne: string;
  clientIdLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState('');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side
      title={hy.jobs.assignTitle}
      subtitle={unitOne}
      footer={
        <button form="job-assign" className="btn btn-auto" disabled={pending}>
          {pending ? hy.common.loading : hy.jobs.assign}
        </button>
      }
    >
      <form
        id="job-assign"
        className="grid gap-3"
        action={(data) =>
          startTransition(async () => {
            await assignJobAction(data);
            onClose();
          })
        }
      >
        <label className="grid gap-1.5">
          <span className="label">{clientIdLabel}</span>
          {/* Поле управляемое нарочно. Пробелы и дефисы не принимаем на
              вводе — номер один и вид у него один, как на пластине; а
              править значение в обработчике неуправляемого поля нельзя:
              React его не перерисовывает, и набранное остаётся как
              набрали. */}
          <input
            className="field num"
            name="clientKey"
            required
            autoFocus
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/[\s-]+/g, '').toUpperCase())}
          />
        </label>

        {/* Мойщик — обязателен. Наряд без исполнителя это заметка, а
            заметки продукт не хранит: у любой машины во дворе есть тот,
            кого за неё спросят. */}
        <label className="grid gap-1.5">
          <span className="label">{hy.jobs.who}</span>
          <select className="field" name="staffId" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Услуга — намерение, а не факт, поэтому не обязательна:
            владелец принимает машину и часто ещё торгуется о цене.
            Окончательное слово остаётся за записью в конце. */}
        <label className="grid gap-1.5">
          <span className="label">{hy.work.stepService}</span>
          <select className="field" name="serviceId" defaultValue="">
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="label">{hy.jobs.note}</span>
          <input className="field" name="note" autoComplete="off" />
        </label>
      </form>
    </Sheet>
  );
}
