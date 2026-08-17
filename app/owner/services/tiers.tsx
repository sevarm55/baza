'use client';

import { useActionState, useState } from 'react';
import { Layers, Plus, X } from 'lucide-react';
import { saveTiersAction, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { FormField } from '@/components/form-field';
import { useT } from '@/lib/i18n/client';

/**
 * Классы машин.
 *
 * ЗАЧЕМ ЭТО ЗДЕСЬ. Джип и седан стоят по-разному, и продукт это умеет:
 * у услуги может быть своя цена на каждый класс. Но включалось свойство
 * только с телефона — кабинет умел классы показывать при записи и не
 * умел их завести. Бизнес, настроенный через браузер, не получал их
 * никогда.
 *
 * Место выбрано не случайно: классы меняют прайс целиком, поэтому живут
 * рядом с прайсом, а не в настройках бизнеса. Свойство редкое, поэтому
 * не прибор на странице, а строка в заголовке раздела — как «добавить
 * услугу».
 *
 * Пустой список выключает классы. Один запрещён на сервере, и отказ
 * приходит словами: один вариант — это отсутствие вариантов, поданное
 * как выбор, и мойщик жал бы единственную кнопку сорок раз за смену.
 */
export function TiersEditor({
  label,
  tiers,
  unitOne,
}: {
  /** как бизнес называет свойство: «Դաս», «Тип кузова» */
  label: string;
  tiers: string[];
  /** «մեքենա» — слово ниши, им объясняем, к чему классы */
  unitOne: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveTiersAction, null);
  const [open, setOpen] = useState(false);
  /* Строки держим состоянием, а не разметкой: их добавляют и убирают, а
     неуправляемые поля при удалении средней строки сдвинули бы значения
     вверх — человек стёр бы «Джип», а исчез бы «Седан». */
  const [rows, setRows] = useState<string[]>(tiers);

  /* Окно закрывается, когда сервер подтвердил. Сверяем в отрисовке, а не
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
      <button type="button" className="btn-inline" onClick={start}>
        <Layers className="size-4" aria-hidden />
        {t.settings.tiers}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side
        title={t.settings.tiers}
        subtitle={t.settings.tiersLead}
        footer={
          <>
            <button type="button" className="btn-inline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button form="tiers" className="btn btn-auto" disabled={pending}>
              {pending ? t.common.loading : t.common.save}
            </button>
          </>
        }
      >
        <form id="tiers" action={action} className="grid gap-3.5">
          <FormField id="tiers-label" label={t.settings.tiersLabel} hint={t.settings.tiersLabelHint}>
            <input
              id="tiers-label"
              className="field auth-field"
              name="label"
              defaultValue={label}
              maxLength={40}
              autoComplete="off"
            />
          </FormField>

          <div className="grid gap-2">
            <span className="label">{t.settings.tierName}</span>

            {rows.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="field auth-field flex-1"
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
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => setRows((cur) => cur.filter((_, at) => at !== i))}
                  aria-label={t.expenses.remove}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}

            {rows.length < LIMIT && (
              <button
                type="button"
                className="btn-inline self-start"
                onClick={() => setRows((cur) => [...cur, ''])}
              >
                <Plus className="size-4" aria-hidden />
                {t.settings.addTier}
              </button>
            )}
          </div>

          {/* Что произойдёт после сохранения — до нажатия, а не после.
              Выключение классов человек делает опустошением списка, и
              узнать об этом он должен заранее. */}
          <p className="note">
            {clean.length === 0 ? t.settings.tiersOff : t.settings.tiersOn(clean.length)}{' '}
            {clean.length > 0 && unitOne}
          </p>

          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
  );
}
