'use client';

import { useActionState, useState } from 'react';
import { Layers, Plus, X } from 'lucide-react';
import { saveTiersAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LoadingButton } from '@/components/loading';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';

/**
 * Классы машин.
 *
 * Джип и седан стоят по-разному, и продукт это умеет: у услуги может
 * быть своя цена на каждый класс. Классы меняют прайс целиком, поэтому
 * живут рядом с прайсом, а не в настройках бизнеса. Свойство редкое,
 * поэтому не панель на странице, а кнопка в шапке раздела.
 *
 * Пустой список выключает классы. Один запрещён на сервере, и отказ
 * приходит словами: один вариант — это отсутствие вариантов, поданное
 * как выбор.
 */
export function TiersEditor({
  label,
  tiers,
}: {
  /** как бизнес называет свойство: «Դաս», «Тип кузова» */
  label: string;
  tiers: string[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveTiersAction, null);
  const [open, setOpen] = useState(false);
  /* Строки держим состоянием, а не разметкой: их добавляют и убирают, а
     неуправляемые поля при удалении средней строки сдвинули бы значения
     вверх — человек стёр бы «Джип», а исчез бы «Седан». */
  const [rows, setRows] = useState<string[]>(tiers);

  /* Лист закрывается, когда сервер подтвердил. Сверяем в отрисовке, а не
     эффектом: эффект успел бы показать кадр с сохранённым, но ещё
     открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  /** Шесть — потолок сервера; больше он всё равно отрежет. */
  const LIMIT = 6;
  const clean = rows.map((r) => r.trim()).filter(Boolean);

  function start() {
    /* Открываем на том, что сейчас в базе. Если классов нет — на двух
       пустых строках: одна была бы предложением завести то, что сервер
       не примет. */
    setRows(tiers.length > 0 ? tiers : ['', '']);
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" onClick={start}>
        <Layers data-icon="inline-start" aria-hidden />
        {t.settings.tiers}
      </Button>

      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.settings.tiers}
        description={t.settings.tiersLead}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="tiers"
              busy={pending}
              label={t.common.save}
              busyLabel={t.common.saving}
            />
          </SheetActions>
        }
      >
        <form
          id="tiers"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <Field>
            <FieldLabel htmlFor="tiers-label">{t.settings.tiersLabel}</FieldLabel>
            <Input id="tiers-label" name="label" defaultValue={label} maxLength={40} autoComplete="off" />
            <FieldDescription className="text-xs">{t.settings.tiersLabelHint}</FieldDescription>
          </Field>

          <FieldSet>
            <FieldLegend variant="label">{t.settings.tierName}</FieldLegend>

            <div className="flex flex-col gap-2">
              {rows.map((value, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    name="tier"
                    value={value}
                    onChange={(e) =>
                      setRows((cur) => cur.map((r, at) => (at === i ? e.target.value : r)))
                    }
                    maxLength={24}
                    autoComplete="off"
                    aria-label={`${t.settings.tierName} ${i + 1}`}
                  />
                  {/* Убрать строку. Цену услуги это не сотрёт: она
                      останется лежать и вернётся вместе с классом. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRows((cur) => cur.filter((_, at) => at !== i))}
                    aria-label={t.expenses.remove}
                  >
                    <X />
                  </Button>
                </div>
              ))}

              {rows.length < LIMIT && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setRows((cur) => [...cur, ''])}
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  {t.settings.addTier}
                </Button>
              )}
            </div>

            {/* Что произойдёт после сохранения — до нажатия, а не после.
                Выключение классов человек делает опустошением списка, и
                узнать об этом он должен заранее. */}
            <FieldDescription className="text-xs">
              {clean.length === 0 ? t.settings.tiersOff : t.settings.tiersOn(clean.length)}
            </FieldDescription>
          </FieldSet>

          {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        </form>
      </EntitySheet>
    </>
  );
}
