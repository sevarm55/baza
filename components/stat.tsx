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
