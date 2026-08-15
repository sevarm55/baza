'use client';

import { useState } from 'react';
import { saveBusiness } from '@/app/actions';
import { useT } from '@/lib/i18n/client';

/**
 * Название бизнеса.
 *
 * Кнопка ведёт себя как в строках услуг и сотрудников: пока править
 * нечего, её нет. Лаймовая кнопка во всю ширину под единственным полем
 * кричала «главное действие страницы» о смене вывески, которую трогают
 * раз в жизни, — а главное здесь цены.
 *
 * Место под кнопку занято всегда, поэтому поле не дёргается на первой
 * же набранной букве.
 */
export function BusinessForm({ name }: { name: string }) {
  const t = useT();
  const [draft, setDraft] = useState(name);
  const dirty = draft.trim() !== name && draft.trim().length >= 2;

  return (
    <form action={saveBusiness} className="row-edit items-center">
      <input
        className="field field-sm min-w-0 flex-1"
        name="name"
        aria-label={t.settings.businessName}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        required
      />
      <button className={`btn-inline btn-inline-primary ${dirty ? '' : 'invisible'}`}>
        {t.settings.save}
      </button>
    </form>
  );
}
