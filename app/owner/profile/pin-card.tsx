'use client';

import { useState } from 'react';
import { ChangePinForm } from './change-pin-form';
import { useT } from '@/lib/i18n/client';

/**
 * PIN в разделе «безопасность».
 *
 * Раньше форма смены стояла раскрытой всегда: на странице профиля
 * постоянно висели двенадцать пустых клеток. Пустой ряд клеток ничего не
 * показывает и ничего не спрашивает — он просто занимает место и
 * читается как сломанный или выключенный элемент, а не как то, что
 * можно сделать.
 *
 * Поэтому по умолчанию здесь строка: что это за код и от чего он.
 * Клетки приходят по нажатию — тогда, когда человек решил его менять.
 */
export function PinCard({ hasPin }: { hasPin: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  if (editing) return <ChangePinForm hasPin={hasPin} onCancel={() => setEditing(false)} />;

  return (
    <div className="setting-row">
      <span className="min-w-0">
        <span className="setting-row-label">{t.auth.pin}</span>
        <span className="setting-row-note">{t.profile.pinNote}</span>
      </span>
      <button type="button" className="btn-inline" onClick={() => setEditing(true)}>
        {hasPin ? t.auth.changePin : t.auth.setPin}
      </button>
    </div>
  );
}
