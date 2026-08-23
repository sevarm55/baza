'use client';

import { useActionState, useState } from 'react';
import { Users } from 'lucide-react';
import { saveTeamPercentAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LoadingButton } from '@/components/loading';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { crewSplit } from '@/lib/crew';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { staffCount } from '@/lib/i18n/terms';

/**
 * Совместная работа: одну машину моют вдвоём-втроём.
 *
 * Главное здесь не поле ввода, а пример под ним. Число «50» само по
 * себе двусмысленно ровно там, где ошибка стоит дороже всего: владелец,
 * решивший, что ставит 50 % каждому из троих, поставит 17 и будет
 * платить втрое меньше, чем собирался. Поэтому пример живой: он
 * пересчитывается, пока человек набирает процент.
 *
 * Пустое поле выключает свойство: мойщику совместная работа перестаёт
 * предлагаться. Ноль этого НЕ делает: ноль означает «мойте вместе,
 * доплаты нет», и это настоящий, хоть и редкий, выбор владельца.
 */
export function TeamWash({
  percent,
  currency,
  staffRole,
}: {
  /** null — свойство выключено */
  percent: number | null;
  currency: string;
  /** «мойщик» — слово ниши, им считаем людей в примере */
  staffRole: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveTeamPercentAction,
    null,
  );
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(percent === null ? '' : String(percent));

  /* Окно закрывается, когда сервер подтвердил. Сверяем в отрисовке, а не
     эффектом: эффект успел бы показать кадр с сохранённым, но ещё
     открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  /* Открываем на том, что сейчас в базе: недописанное в прошлый раз и
     не сохранённое не должно встречать человека снова. */
  function start() {
    setText(percent === null ? '' : String(percent));
    setOpen(true);
  }

  const typed = Number.parseInt(text, 10);
  const asked = Number.isFinite(typed) ? Math.max(0, Math.min(100, typed)) : null;

  /* Пример считает тот же код, что посчитает сервер (`lib/crew.ts`), и
     на тех же числах, что увидит мойщик у себя на экране. */
  const EXAMPLE_PRICE = 10_000;
  const EXAMPLE_PEOPLE = 2;
  const example = crewSplit({
    price: EXAMPLE_PRICE,
    people: EXAMPLE_PEOPLE,
    soloPercent: 0,
    teamPercent: asked,
  });

  return (
    <>
      {/* Состояние прямо на кнопке: свойство редкое, и открывать окно
          только чтобы узнать, включено ли оно, — лишний путь. */}
      <Button variant="outline" onClick={start}>
        <Users data-icon="inline-start" aria-hidden />
        {t.crew.title}
        <span className="num text-muted-foreground">
          {percent === null ? t.crew.off : `${percent}%`}
        </span>
      </Button>

      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.crew.title}
        description={t.crew.lead}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="team-wash"
              busy={pending}
              label={t.common.save}
              busyLabel={t.common.saving}
            />
          </SheetActions>
        }
      >
        <form
          id="team-wash"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <Field>
            <FieldLabel htmlFor="team-percent">{t.crew.percentLabel}</FieldLabel>
            <Input
              id="team-percent"
              name="percent"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              autoComplete="off"
              /* Пусто — выключить. Подсказка говорит это словом, а не
                 значком: пустое поле в форме обычно значит «не заполнил»,
                 и здесь оно значит другое. */
              placeholder={t.crew.off}
              className="num"
            />
            <FieldDescription className="text-xs">{t.crew.percentHint}</FieldDescription>
          </Field>

          {/* Что произойдёт после сохранения — до нажатия, числами. Здесь
              и разрешается двусмысленность процента: видно, что пятьдесят
              на двоих дают по четверти цены каждому. */}
          <div className="rounded-md bg-muted p-3 text-sm">
            {asked === null
              ? t.crew.offNote
              : t.crew.example(
                  formatMoney(EXAMPLE_PRICE, currency, t.locale),
                  example.percent,
                  staffCount(EXAMPLE_PEOPLE, staffRole, t.locale),
                  formatMoney(example.shares[0] ?? 0, currency, t.locale),
                )}
          </div>

          {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        </form>
      </EntitySheet>
    </>
  );
}
