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
    <div className="card">
      <div className="mb-[5px] text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-3.5 grid grid-cols-2 gap-2.5">{children}</div>;
}

export function Avatar({ text }: { text: string }) {
  const initials = text
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2 text-[13px] font-semibold">
      {initials}
    </div>
  );
}
