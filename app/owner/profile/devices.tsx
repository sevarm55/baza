'use client';

import { useState, useTransition } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { revokeDeviceAction } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

export type DeviceRow = {
  id: string;
  /** web | app */
  kind: string;
  /** метка устройства, как её назвал клиент; пусто у старых сессий */
  device: string | null;
  /** «сегодня, 12:24» — час считает сервер, в поясе бизнеса */
  lastSeen: string;
  current: boolean;
};

/**
 * Устройства, с которых открыт вход.
 *
 * Зачем это на экране. Телефон на мойке общий и переходит из рук в руки,
 * а пара токенов живёт тридцать дней. Пока списка не было, погасить чужой
 * вход можно было только сменой PIN — то есть вылетев самому и заодно
 * выкинув себя со всех своих устройств. Наказание за потерянный телефон
 * получалось больше самой потери, и им не пользовались.
 *
 * Своё устройство помечено и кнопки не имеет. Не из вежливости: человек,
 * погасивший вход, из которого смотрит, увидит экран входа посреди работы
 * и решит, что продукт сломался. Выйти отсюда есть чем — кнопка «выйти»
 * стоит ниже и называет себя выходом.
 */
export function DeviceList({ rows }: { rows: DeviceRow[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  /* Какое именно устройство гасим. Один общий признак занятости
     блокировал разом все строки списка и ни в одной не показывал, что
     происходит: человек нажимал «выйти» на телефоне жены и видел, как
     гаснут все четыре кнопки сразу. */
  const [revoking, setRevoking] = useState<string | null>(null);

  /* Один вход и он же этот — говорить не о чем: список из одной строки
     «это устройство» с нечего погасить не отвечает ни на один вопрос. */
  if (rows.length <= 1) {
    return (
      <p className="text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
        {t.profile.devicesOne}
      </p>
    );
  }

  return (
    <>
      <p className="mb-3.5 text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
        {t.profile.devicesNote}
      </p>

      <div className="rows">
        {rows.map((row) => (
          <div key={row.id} className="setting-row">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="tone-mark" data-tone={row.kind === 'app' ? 'teal' : 'violet'}>
                {row.kind === 'app' ? (
                  <Smartphone className="size-4" aria-hidden />
                ) : (
                  <Monitor className="size-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="setting-row-label">
                  {row.device || (row.kind === 'app' ? t.profile.deviceApp : t.profile.deviceWeb)}
                </span>
                <span className="setting-row-note">
                  {row.current ? t.profile.deviceThis : t.profile.deviceLastSeen(row.lastSeen)}
                </span>
              </span>
            </span>

            {/* Своё устройство гасить нечем: для этого есть «выйти». */}
            {!row.current && (
              <LoadingButton
                type="button"
                className="btn-inline text-bad"
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
          </div>
        ))}
      </div>
    </>
  );
}
