'use client';

import { useState, useTransition } from 'react';

import { SettingRow } from '@/components/patterns/form';
import { Switch } from '@/components/ui/switch';

/**
 * Переключатель настройки: подпись и пояснение слева, тумблер справа.
 *
 * Нажатие переключает сразу, не дожидаясь сервера, и откатывается при
 * отказе. Настройка не форма: ждать круга к серверу, глядя на
 * невключившийся тумблер, человек не станет, он нажмёт второй раз.
 */
export function SettingSwitch({
  id,
  label,
  description,
  initial,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  initial: boolean;
  /** бросает, значит не сохранилось, и тумблер вернётся назад */
  onChange: (next: boolean) => Promise<void>;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    /* Второе нажатие, пока первое ещё летит, отменило бы его же ответ:
       тумблер вернулся бы в исходное положение и настройка молча не
       сохранилась. */
    if (pending) return;
    setOn(next);
    startTransition(async () => {
      try {
        await onChange(next);
      } catch {
        setOn(!next);
      }
    });
  }

  return (
    <SettingRow
      label={label}
      description={description}
      htmlFor={id}
      control={
        /* Тумблер не гасится на время запроса: ответ на нажатие уже дан,
           и бледная строка сообщала бы ровно обратное. */
        <Switch id={id} checked={on} onCheckedChange={toggle} aria-busy={pending || undefined} />
      }
    />
  );
}
