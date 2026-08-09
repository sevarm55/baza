import { personColor } from '@/lib/person-color';

/**
 * Главное число экрана.
 *
 * Владелец открывает приложение ради одной цифры. Когда она набрана
 * тем же кеглем, что и средний чек, взгляду не за что зацепиться —
 * именно это и читается как «скучно».
 */
export function Hero({
  label,
  value,
  meta,
  tone = 'good',
}: {
  label: string;
  value: string;
  meta?: React.ReactNode;
  tone?: 'good' | 'ink';
}) {
  return (
    <div className="mb-3.5">
      <div className="label">{label}</div>
      <div
        className={`num mt-1.5 text-[clamp(2.375rem,10vw,3rem)] leading-[0.95] font-bold tracking-[-0.03em] ${
          tone === 'good' ? 'text-good' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {meta && <div className="mt-2.5 text-[13px] text-muted">{meta}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'good' | 'warn';
}) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : '';
  return (
    <div className="tile">
      <div className="label mb-1.5">{label}</div>
      {/* Число — главное на плитке, поэтому кегль отрывается от подписи резко.
          Когда всё набрано одним размером, глазу не за что зацепиться. */}
      <div className={`num text-[24px] font-semibold leading-none tracking-[-0.03em] ${color}`}>
        {value}
      </div>
    </div>
  );
}

export function StatGrid({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`grid grid-cols-2 gap-[var(--seam)] ${className}`}>{children}</div>;
}

export function Avatar({ text }: { text: string }) {
  const initials = text
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  /* Плитка цветом самого человека: список сотрудников — это первое
     место, где владелец связывает имя с цветом, и дальше по ленте он
     узнаёт его уже без чтения. */
  const color = personColor(text);
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-chip)] text-[13px] font-semibold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {initials}
    </div>
  );
}
