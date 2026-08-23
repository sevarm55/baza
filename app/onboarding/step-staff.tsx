'use client';

import { useState, useTransition } from 'react';

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';
import { addStaffStep } from './actions';
import type { FlowWorker } from './flow';

/**
 * Шаг 3: первый работник.
 *
 * Ровно те поля, без которых работника не бывает: как зовут, по какому
 * номеру и коду он входит, какой у него процент. Никаких дополнительных
 * настроек — они живут в разделе работников, когда понадобятся.
 */
export function StepStaff({
  defaultPercent,
  onDone,
}: {
  defaultPercent: number;
  onDone: (worker: FlowWorker) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [percent, setPercent] = useState(String(defaultPercent));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await addStaffStep({
        name,
        phone,
        pin,
        percent: Number(percent),
      });
      if (res.error || !res.worker) setError(res.error ?? t.errors.generic);
      else onDone({ name: res.worker.name, phone: res.worker.phone });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{t.firstRun.s3Title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.firstRun.s3Note}</p>
      </header>

      <Field>
        <FieldLabel htmlFor="fr-staff-name">{t.settings.name}</FieldLabel>
        <Input
          id="fr-staff-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="fr-staff-phone">{t.auth.phone}</FieldLabel>
        <Input
          id="fr-staff-phone"
          type="tel"
          inputMode="tel"
          placeholder="+374 77 123 456"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
          className="num"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="fr-staff-pin">
            {t.auth.staffAccessCode} · {t.auth.pinHint}
          </FieldLabel>
          <Input
            id="fr-staff-pin"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="off"
            className="num"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="fr-staff-percent">
            {t.settings.percent} · {t.firstRun.s3PercentNote}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="fr-staff-percent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="num"
            />
          </InputGroup>
        </Field>
      </div>

      {/* Подпись про код одна на сетку: под своей ячейкой она рвала бы
          ряд из двух полей на разную высоту. */}
      <FieldDescription className="-mt-2 text-xs">{t.auth.staffAccessCodeNote}</FieldDescription>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <LoadingButton
        type="button"
        className="w-full"
        busy={pending}
        label={t.settings.addStaff}
        busyLabel={t.common.adding}
        onClick={submit}
      />
    </div>
  );
}
