'use client';

import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { useT } from '@/lib/i18n/client';

/**
 * Поля услуги — название и цена.
 *
 * Один набор на два листа: заведение новой и правку существующей. Поля
 * там одни и те же, потому что продукт про услугу больше ничего не
 * хранит; две копии этой пары разъехались бы на первой же правке.
 *
 * Форму держит вызывающий: у листа правки она с идентификатором (кнопка
 * «сохранить» стоит в подвале, вне формы), у листа заведения — своя.
 * Отсюда `idPrefix`: два таких набора могут одновременно жить в дереве,
 * а два поля с одинаковым `id` рвут связь подписи с вводом.
 */
export function ServiceFields({
  idPrefix,
  name,
  price,
  tiers,
  tierPrices,
  step,
  currencySymbol,
  autoFocus = false,
}: {
  idPrefix: string;
  name?: string;
  /** цена в крупных единицах — её и правят в поле */
  price?: number;
  /** классы бизнеса; пусто — ряда цен по классам нет вовсе */
  tiers: string[];
  /** цена на каждый класс, в крупных единицах; 0 — «как базовая» */
  tierPrices?: number[];
  step: number;
  currencySymbol: string;
  autoFocus?: boolean;
}) {
  const t = useT();

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>{t.settings.name}</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={name}
          required
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price`}>{t.settings.price}</FieldLabel>
        {/* Знак валюты — часть поля, а не подпись рядом: он говорит, в
            чём набирают. */}
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>{currencySymbol}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={`${idPrefix}-price`}
            name="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            defaultValue={price}
            required
            className="num font-medium"
          />
        </InputGroup>
        <FieldDescription className="text-xs">{t.settings.priceNote}</FieldDescription>
      </Field>

      {/* Цены по классам.

          Показываются, только когда классы у бизнеса есть. Скрытый
          признак рядом — по нему серверное действие отличает «форма их
          не показывала» от «человек очистил все поля»: первое означает
          «не трогать», второе — «везде базовая».

          Пустая клетка уезжает нулём, и правило «нет своей цены — берём
          базовую» остаётся в одном месте на весь продукт
          (`priceForTier`). Подставлять сюда базовую цену за человека
          нельзя: тогда поднятие базовой перестало бы поднимать классы. */}
      {tiers.length > 0 && (
        <FieldSet>
          <input type="hidden" name="tierPrices" value="1" />
          <FieldLegend variant="label">{t.settings.tierPrices}</FieldLegend>

          <div className="flex flex-col gap-2">
            {tiers.map((tier, i) => (
              <Field key={`${i}-${tier}`} orientation="horizontal">
                <FieldLabel
                  htmlFor={`${idPrefix}-tier-${i}`}
                  className="min-w-0 flex-1 truncate font-normal text-muted-foreground"
                >
                  {tier}
                </FieldLabel>
                <InputGroup className="w-40 shrink-0">
                  <InputGroupAddon>
                    <InputGroupText>{currencySymbol}</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${idPrefix}-tier-${i}`}
                    name={`tierPrice${i}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={step}
                    defaultValue={tierPrices?.[i] ? tierPrices[i] : ''}
                    placeholder={price !== undefined ? String(price) : ''}
                    autoComplete="off"
                    className="num"
                  />
                </InputGroup>
              </Field>
            ))}
          </div>

          <FieldDescription className="text-xs">{t.settings.tierPriceHint}</FieldDescription>
        </FieldSet>
      )}
    </>
  );
}
