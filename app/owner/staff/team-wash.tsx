'use client';

import { useActionState, useState } from 'react';
import { Users } from 'lucide-react';
import { saveTeamPercentAction, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { FormField } from '@/components/form-field';
import { crewSplit } from '@/lib/crew';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { staffCount } from '@/lib/i18n/terms';

/**
 * Совместная работа: одну машину моют вдвоём-втроём.
 *
 * ЧТО ЗДЕСЬ ГЛАВНОЕ. Не поле ввода, а пример под ним. Число «50» само по
 * себе двусмысленно ровно в том месте, где ошибка стоит дороже всего:
 * владелец, решивший, что ставит 50 % каждому из троих, поставит 17 и
 * будет платить втрое меньше, чем собирался; понявший наоборот — втрое
 * больше. Определение эту разницу объясняет, но определения пролистывают,
 * а пример с числами читают. Поэтому пример живой: он пересчитывается,
 * пока человек набирает процент, и показывает ровно то, что произойдёт.
 *
 * Место выбрано не случайно: это условие оплаты труда, и живёт оно среди
 * людей, а не в настройках бизнеса рядом с названием точки. Тем же
 * соображением классы машин живут рядом с прайсом.
 *
 * Пустое поле выключает свойство: мойщику совместная работа перестаёт
 * предлагаться. Ноль этого НЕ делает — ноль означает «мойте вместе,
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
     открытым окном. Тот же приём, что у классов машин. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  const typed = Number.parseInt(text, 10);
  const asked = Number.isFinite(typed) ? Math.max(0, Math.min(100, typed)) : null;

  /* Пример считает тот же код, что посчитает сервер (`lib/crew.ts`), и
     на тех же числах, что увидит мойщик у себя на экране. Своя формула
     здесь разошлась бы с настоящей на первом же остатке от деления. */
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
      <button type="button" className="btn-inline" onClick={() => setOpen(true)}>
        <Users className="size-4" aria-hidden />
        {t.crew.title}
        {/* Состояние прямо на кнопке. Свойство редкое, и открывать окно
            только чтобы узнать, включено ли оно, — это лишний путь на
            странице, куда заходят за другим. */}
        <span className="num" style={{ color: 'var(--board-muted)' }}>
          {percent === null ? t.crew.off : `${percent}%`}
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side
        title={t.crew.title}
        subtitle={t.crew.lead}
        footer={
          <>
            <button type="button" className="btn-inline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button form="team-wash" className="btn btn-auto" disabled={pending}>
              {pending ? t.common.loading : t.common.save}
            </button>
          </>
        }
      >
        <form id="team-wash" action={action} className="grid gap-3.5">
          <FormField
            id="team-percent"
            label={t.crew.percentLabel}
            hint={t.crew.percentHint}
          >
            <input
              id="team-percent"
              className="field auth-field num"
              name="percent"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              autoComplete="off"
              /* Пусто — выключить. Подсказка в placeholder говорит это
                 словом, а не значком: пустое поле в форме обычно значит
                 «не заполнил», и здесь оно значит другое. */
              placeholder={t.crew.off}
            />
          </FormField>

          {/* Что произойдёт после сохранения — до нажатия, числами.
              Здесь и разрешается двусмысленность процента: видно, что
              пятьдесят на двоих дают по четверти цены каждому. */}
          {asked === null ? (
            <p className="note">{t.crew.offNote}</p>
          ) : (
            <p className="note">
              {t.crew.example(
                formatMoney(EXAMPLE_PRICE, currency, t.locale),
                example.percent,
                staffCount(EXAMPLE_PEOPLE, staffRole, t.locale),
                formatMoney(example.shares[0] ?? 0, currency, t.locale),
              )}
            </p>
          )}

          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
  );
}
