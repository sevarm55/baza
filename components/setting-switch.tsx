'use client';

import { useState, useTransition } from 'react';

/**
 * Переключатель настройки: название, пояснение под ним и тумблер справа.
 *
 * Отдельным компонентом, потому что таких настроек в профиле уже две, а
 * разметка у них была одна и та же — скопированная. Вторая копия
 * означала бы, что тумблеры разъедутся на первой же правке размера:
 * одинаковые на вид приборы, набранные разными числами, читаются как
 * детали из разных наборов.
 *
 * Нажатие переключает сразу, не дожидаясь сервера, и откатывается при
 * отказе. Настройка — не форма: ждать круга к серверу, глядя на
 * невключившийся тумблер, человек не станет, он нажмёт второй раз.
 */
export function SettingSwitch({
  label,
  note,
  initial,
  onChange,
}: {
  label: string;
  note?: string;
  initial: boolean;
  /** бросает — значит не сохранилось, и тумблер вернётся назад */
  onChange: (next: boolean) => Promise<void>;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    /* Второе нажатие, пока первое ещё летит, отменило бы его же ответ:
       тумблер вернулся бы в исходное положение и настройка молча не
       сохранилась. */
    if (pending) return;
    const next = !on;
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      /* Тумблер переключается сразу и возвращается назад, если сервер
         не принял. Гасить его на время запроса не за что: ответ на
         нажатие уже дан, и бледная строка сообщала бы ровно обратное. */
      aria-busy={pending || undefined}
      onClick={toggle}
      className="group flex w-full items-center justify-between gap-4 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--board-ink)_5%,transparent)] px-3.5 py-3 text-start outline-none transition hover:bg-[color-mix(in_srgb,var(--board-ink)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: 'var(--on-board)' }}>
          {label}
        </span>
        {note && (
          <span
            className="mt-0.5 block text-[12px] leading-snug"
            style={{ color: 'var(--board-muted)' }}
          >
            {note}
          </span>
        )}
      </span>

      <span
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
        style={{
          background: on ? 'var(--accent2)' : 'color-mix(in srgb, var(--board-ink) 14%, transparent)',
        }}
        aria-hidden
      >
        <span
          className="absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: `translateX(${on ? '24px' : '4px'})` }}
        />
      </span>
    </button>
  );
}
