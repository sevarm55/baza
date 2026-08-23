'use client';

import { StatusBadge } from '@/components/patterns/status-badge';
import { useA } from '@/lib/i18n/admin/client';

/** Уровень события безопасности: тихий, внимание, тревога. */
export function LevelBadge({ level }: { level: string }) {
  const a = useA();
  const tone = level === 'alert' ? 'danger' : level === 'warn' ? 'warning' : 'neutral';
  const label = a.activity.levels[level as 'info' | 'warn' | 'alert'] ?? level;
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
