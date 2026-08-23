'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { addStaff, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { LoadingButton } from '@/components/loading';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage, FormSection } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';

/**
 * Найм.
 *
 * Форма приходит по нажатию и уходит: пять полей нужны раз в полгода,
 * а список людей, ради которого раздел открывают, стоит на своём месте.
 *
 * Внутри та же граница, что в карточке сотрудника: сначала кто это,
 * потом чем он входит. Телефон и код — не «ещё два поля», а ключ от
 * кабинета, и то, что код диктуют вслух и его не надо запоминать,
 * сказано прямо здесь, а не выясняется потом.
 */
export function AddStaff({
  staffRole,
  variant = 'default',
}: {
  staffRole: string;
  /** в шапке главной кнопкой, в пустом месте той же, в ряду тихой */
  variant?: 'default' | 'outline';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(addStaff, null);
  const [open, setOpen] = useState(false);

  /* Лист закрывается, когда сервер подтвердил запись. Сверяем в
     отрисовке, а не эффектом: эффект показал бы кадр с уже сохранённым,
     но ещё открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t.settings.addStaff}
      </Button>

      {/* Действие в подвале листа, а не в конце формы: на телефоне здесь
          пять полей, и с поднятой клавиатурой кнопка уезжала под неё. */}
      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.settings.addStaff}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="staff-new"
              busy={pending}
              label={t.settings.addStaff}
              busyLabel={t.common.adding}
            />
          </SheetActions>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлым недописанным человеком. */}
        <form
          key={String(open)}
          id="staff-new"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <FormSection first>
            <Field>
              <FieldLabel htmlFor="staff-new-name">{t.settings.name}</FieldLabel>
              <Input id="staff-new-name" name="name" required autoComplete="off" autoFocus />
            </Field>

            <Field>
              <FieldLabel htmlFor="staff-new-percent">
                {t.settings.percent} · {staffRole}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="staff-new-percent"
                  name="percent"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  defaultValue={40}
                  required
                  className="num"
                />
              </InputGroup>
            </Field>
          </FormSection>

          {/* Доступ отделён заголовком, а не просто следующим полем: это
              не продолжение анкеты, а ключ от кабинета. */}
          <FormSection title={t.settings.access}>
            <Field>
              <FieldLabel htmlFor="staff-new-phone">{t.auth.phone}</FieldLabel>
              <Input
                id="staff-new-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="+374 77 123 456"
                required
                autoComplete="off"
                className="num"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="staff-new-pin">
                {t.auth.staffAccessCode} · {t.auth.pinHint}
              </FieldLabel>
              <Input
                id="staff-new-pin"
                name="pin"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoComplete="off"
                className="num"
              />
              <FieldDescription className="text-xs">{t.auth.staffAccessCodeNote}</FieldDescription>
            </Field>
          </FormSection>

          {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        </form>
      </EntitySheet>
    </>
  );
}
