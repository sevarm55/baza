'use client';

import { useState, useTransition } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

import { revokeDeviceAction } from '@/app/actions';
import { LoadingButton } from '@/components/loading';
import { StatusBadge } from '@/components/patterns/status-badge';
import { useT } from '@/lib/i18n/client';

export type DeviceRow = {
  id: string;
  /** web | app */
  kind: string;
  /** метка устройства, как её назвал клиент; пусто у старых сессий */
  device: string | null;
  /** «сегодня, 12:24»: час считает сервер, в поясе бизнеса */
  lastSeen: string;
  current: boolean;
};

/**
 * Устройства, с которых открыт вход.
 *
 * Телефон на мойке общий и переходит из рук в руки, а пара токенов
 * живёт тридцать дней. Пока списка не было, погасить чужой вход можно
 * было только сменой PIN, то есть вылетев самому.
 *
 * Своё устройство помечено и кнопки не имеет: человек, погасивший
 * вход, из которого смотрит, увидит экран входа посреди работы. Выйти
 * отсюда есть чем: кнопка «выйти» стоит ниже и называет себя выходом.
 */
export function DeviceList({ rows }: { rows: DeviceRow[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  /* Какое именно устройство гасим: один общий признак занятости гасил
     бы разом все строки и ни в одной не показывал, что происходит. */
  const [revoking, setRevoking] = useState<string | null>(null);

  /* Один вход и он же этот: список из одной строки «это устройство»
     не отвечает ни на один вопрос. */
  if (rows.length <= 1) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{t.profile.devicesOne}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {row.kind === 'app' ? (
              <Smartphone className="size-4" aria-hidden />
            ) : (
              <Monitor className="size-4" aria-hidden />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="truncate">
                {row.device || (row.kind === 'app' ? t.profile.deviceApp : t.profile.deviceWeb)}
              </span>
              {row.current && <StatusBadge tone="brand">{t.profile.deviceThis}</StatusBadge>}
            </div>
            <div className="text-xs text-muted-foreground">{t.profile.deviceLastSeen(row.lastSeen)}</div>
          </div>

          {/* Своё устройство гасить нечем: для этого есть «выйти». */}
          {!row.current && (
            <LoadingButton
              type="button"
              variant="outline"
              size="xs"
              busy={pending && revoking === row.id}
              disabled={pending && revoking !== row.id}
              label={t.profile.deviceRevoke}
              busyLabel={t.common.deleting}
              onClick={() => {
                setRevoking(row.id);
                start(() => void revokeDeviceAction(row.id));
              }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
