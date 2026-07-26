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
        className={`num mt-1.5 text-[clamp(2.5rem,11vw,3.25rem)] leading-none font-bold tracking-tight ${
          tone === 'good' ? 'text-good' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {meta && <div className="mt-2.5 text-[13.5px] text-muted">{meta}</div>}
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
      <div className={`num text-[26px] font-semibold leading-none tracking-tight ${color}`}>
        {value}
      </div>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-2.5">{children}</div>;
}

export function Avatar({ text }: { text: string }) {
  const initials = text
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2 text-[12.5px] font-semibold text-muted">
      {initials}
    </div>
  );
}
