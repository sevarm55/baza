'use client';

import { FormField } from '@/components/form-field';
import { useT } from '@/lib/i18n/client';

/**
 * Поля услуги — название и цена.
 *
 * Один набор на два окна: заведение новой и правку существующей. Поля
 * там одни и те же, потому что продукт про услугу больше ничего не
 * хранит; две копии этой пары разъехались бы на первой же правке —
 * у одной подпись, у другой подсказка, у одной знак валюты, у другой
 * нет.
 *
 * Форму держит вызывающий: у окна правки она с идентификатором (кнопка
 * «сохранить» стоит в подвале, вне формы), у окна заведения — своя.
 * Отсюда `idPrefix`: два таких набора могут одновременно жить в дереве,
 * а два поля с одинаковым `id` рвут связь подписи с вводом.
 */
export function ServiceFields({
  idPrefix,
  name,
  price,
  step,
  currencySymbol,
  autoFocus = false,
}: {
  idPrefix: string;
  name?: string;
  /** цена в крупных единицах — её и правят в поле */
  price?: number;
  step: number;
  currencySymbol: string;
  autoFocus?: boolean;
}) {
  const t = useT();

  return (
    <>
      <FormField id={`${idPrefix}-name`} label={t.settings.name}>
        <input
          id={`${idPrefix}-name`}
          className="field auth-field"
          name="name"
          defaultValue={name}
          required
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </FormField>

      <FormField id={`${idPrefix}-price`} label={t.settings.price} hint={t.settings.priceNote}>
        <div className="relative">
          <input
            id={`${idPrefix}-price`}
            className="field auth-field num !ps-9 !text-[17px] !font-semibold"
            name="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            defaultValue={price}
            required
          />
          {/* Знак валюты — часть поля, а не подпись рядом: он говорит,
              в чём набирают, и не должен уезжать при переносе строки. */}
          <span
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[15px]"
            style={{ color: 'var(--faint)' }}
            aria-hidden
          >
            {currencySymbol}
          </span>
        </div>
      </FormField>
    </>
  );
}
