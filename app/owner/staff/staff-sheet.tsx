'use client';

import { useActionState, useState, useTransition } from 'react';
import { KeyRound, Wallet } from 'lucide-react';
import { archiveStaff, resetStaffPinAction, saveStaff, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { LoadingButton } from '@/components/loading';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { DetailList, DetailRow, LinkRow } from '@/components/patterns/detail-list';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage, FormSection } from '@/components/patterns/form';
import { Metric } from '@/components/patterns/metric';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';
import type { StaffPerson } from './model';
import { autoFocusOnDesktop } from '@/lib/autofocus';

/**
 * Карточка сотрудника.
 *
 * Сверху результат — то, ради чего человека держат: машины и заработок
 * за месяц. Ниже то, что правят по разговору (имя, процент), и отдельно
 * от него доступ в систему: телефон и код — ключ от кабинета, смена
 * номера означает другого человека, а код хранится хешем и заново только
 * назначается.
 */
export function StaffSheet({
  person,
  money,
  unitOne,
  onClose,
}: {
  /** кто открыт; `null` — лист закрыт */
  person: StaffPerson | null;
  money: (n: number) => string;
  unitOne: string;
  onClose: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveStaff, null);

  /* Лист закрывается, когда сервер подтвердил запись. Сверяем в
     отрисовке, а не эффектом: эффект показал бы кадр с уже сохранённым,
     но ещё открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) onClose();
  }

  /* Отключение: подтверждение отдельным окном, сама запись — тем же
     действием и с тем же полем `id`, что и раньше. */
  const [confirm, setConfirm] = useState(false);
  const [removing, startRemove] = useTransition();
  function remove(id: string) {
    startRemove(async () => {
      const fd = new FormData();
      fd.set('id', id);
      await archiveStaff(fd);
      setConfirm(false);
      onClose();
    });
  }

  const monthWord = t.owner.periodMonth.toLocaleLowerCase(t.locale);

  return (
    <EntitySheet
      open={person !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      width="lg"
      title={person?.name ?? ''}
      description={
        person
          ? person.present
            ? `${person.roleLabel} · ${t.owner.onShiftNow}`
            : person.roleLabel
          : undefined
      }
      footer={
        <SheetActions
          start={
            person?.canRemove && (
              <Button variant="destructive-soft" onClick={() => setConfirm(true)}>
                {t.settings.remove}
              </Button>
            )
          }
        >
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <LoadingButton
            form="staff-edit"
            busy={pending}
            label={t.settings.save}
            busyLabel={t.common.saving}
          />
        </SheetActions>
      }
    >
      {person && (
        <div className="flex flex-col gap-5">
          {/* Результат месяца — ответ на вопрос, ради которого карточку
              открывают. */}
          <Metric
            size="sm"
            label={t.owner.payrollAccrued}
            value={money(person.earned)}
            hint={`${unitCount(person.count, unitOne, t.locale)} · ${monthWord}`}
          />

          <DetailList>
            <DetailRow label={t.settings.percent} value={`${person.percent}%`} mono />
            <DetailRow
              label={t.owner.onShift}
              value={
                person.present ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden />
                    {person.since ? t.today.since(person.since) : t.owner.onShiftNow}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">{t.owner.offShiftNow}</span>
                )
              }
            />
            {/* Долг называется только когда он есть: «0 ֏ к выплате» — не
                показание, а пустая строка на его месте. */}
            {person.due > 0 && <DetailRow label={t.owner.toPay} value={money(person.due)} mono />}
          </DetailList>

          <FormSection>
            {/* Ключом стоит человек: при переходе к другому поля обязаны
                сброситься, а не донести чужое имя и чужой процент. */}
            <form
              key={person.id}
              id="staff-edit"
              action={action}
              onSubmit={(e) => {
                if (pending) e.preventDefault();
              }}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="id" value={person.id} />

              <Field>
                <FieldLabel htmlFor="staff-edit-name">{t.settings.name}</FieldLabel>
                <Input
                  id="staff-edit-name"
                  name="name"
                  defaultValue={person.name}
                  required
                  autoComplete="off"
                  autoFocus={autoFocusOnDesktop()}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="staff-edit-percent">{t.settings.percent}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>%</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="staff-edit-percent"
                    name="percent"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    defaultValue={person.percent}
                    required
                    className="num"
                  />
                </InputGroup>
                <FieldDescription className="text-xs">{t.settings.percentNote}</FieldDescription>
              </Field>

              {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
            </form>
          </FormSection>

          {/* Доступ в систему — отдельным разделом, а не полями формы:
              телефон правке не подлежит, код не показывается. */}
          <FormSection title={t.settings.access}>
            <DetailList>
              <DetailRow label={t.auth.phone} value={formatPhone(person.phone)} mono />
              <DetailRow
                label={t.auth.staffAccessCode}
                value={<span className="font-normal text-muted-foreground">{t.settings.pinHidden}</span>}
              />
              <DetailRow label={t.settings.role} value={person.roleLabel} />
            </DetailList>
            <FieldDescription className="text-xs">{t.settings.staffNote}</FieldDescription>

            {/* Новый код — только сотруднику и только тому, кто больше
                нигде не работает: отказ приходит с сервера словами. */}
            {person.canRemove && !person.owner && (
              <ResetPin id={person.id} key={`pin-${person.id}`} />
            )}
          </FormSection>

          <div className="rounded-lg border border-border">
            <LinkRow href="/owner/payroll" title={t.reports.toPayroll} icon={<Wallet />} />
          </div>

          {person.canRemove && (
            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              destructive
              title={t.settings.remove}
              description={t.settings.removeStaffNote}
              confirmLabel={t.settings.remove}
              busyLabel={t.common.deleting}
              busy={removing}
              onConfirm={() => remove(person.id)}
            >
              <p className="text-sm font-medium">
                {person.name} · {person.roleLabel}
              </p>
            </ConfirmDialog>
          )}
        </div>
      )}
    </EntitySheet>
  );
}

/**
 * Новый код сотруднику.
 *
 * Свёрнуто по умолчанию: пустой ряд клеток в карточке ничего не
 * спрашивает и читается сломанным элементом. Код показывается открытым:
 * владелец придумывает его вслух, стоя рядом с работником, и должен
 * видеть, что набрал.
 */
function ResetPin({ id }: { id: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(resetStaffPinAction, null);
  const [open, setOpen] = useState(false);

  /* После удачи форма сворачивается, а подтверждение остаётся строкой
     под кнопкой. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <KeyRound data-icon="inline-start" aria-hidden />
          {t.settings.pinReset}
        </Button>
        {state?.ok && <FormMessage tone="success">{t.settings.pinResetDone}</FormMessage>}
      </div>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3"
    >
      <input type="hidden" name="id" value={id} />

      <Field>
        <FieldLabel htmlFor="staff-pin">{t.settings.pinReset}</FieldLabel>
        <Input
          id="staff-pin"
          name="pin"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="off"
          autoFocus={autoFocusOnDesktop()}
          required
          className="num"
        />
        <FieldDescription className="text-xs">{t.settings.pinResetNote}</FieldDescription>
      </Field>

      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}

      <div className="flex items-center gap-2">
        <LoadingButton size="sm" busy={pending} label={t.settings.save} busyLabel={t.common.saving} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
