'use client';

import { useRef, useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { saveServicesStep } from './actions';

/**
 * Шаг 1: прайс.
 *
 * Список уже засеян регистрацией, поэтому шаг не просит «добавьте
 * услуги» в пустоту — он показывает стартовый прайс строками и просит
 * сделать его своим: поправить цены, убрать лишнее, дописать своё.
 * Сохраняется одним нажатием целиком; дублей не бывает по построению —
 * правится та же строка, что лежит в базе.
 *
 * Убранная услуга возвращается чипом «быстрого добавления»: чипы — это
 * те же заводские услуги ниши, которых сейчас нет в списке.
 */

export type ServiceItem = { id?: string; name: string; price: number };

type Row = { key: number; id?: string; name: string; price: string };

export function StepServices({
  services,
  presets,
  currencySymbol,
  moneyStep,
  onDone,
}: {
  services: ServiceItem[];
  presets: { name: string; price: number }[];
  currencySymbol: string;
  moneyStep: number;
  onDone: () => void;
}) {
  const t = useT();
  /* Ключи строк: стартовые — по индексу, добавленные — счётчиком дальше.
     Счётчик трогается только в обработчиках, не в отрисовке. */
  const seq = useRef(services.length);
  const [rows, setRows] = useState<Row[]>(() =>
    services.map((s, i) => ({ key: i, id: s.id, name: s.name, price: String(s.price) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const present = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const missing = presets.filter((p) => !present.has(p.name.toLowerCase()));

  const edit = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = (name = '', price = '') =>
    setRows((rs) => [...rs, { key: seq.current++, name, price }]);

  function submit() {
    if (pending) return;
    const filled = rows.filter((r) => r.name.trim());
    if (filled.length === 0) {
      setError(t.firstRun.s1Empty);
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveServicesStep(
        filled.map((r) => ({ id: r.id, name: r.name.trim(), price: Number(r.price) || 0 })),
      );
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{t.firstRun.s1Title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.firstRun.s1Note}</p>
      </header>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <Input
              aria-label={t.firstRun.s1Service}
              placeholder={t.firstRun.s1Service}
              value={row.name}
              onChange={(e) => edit(row.key, { name: e.target.value })}
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <InputGroup className="w-32 shrink-0 sm:w-36">
              <InputGroupAddon>
                <InputGroupText>{currencySymbol}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t.settings.price}
                type="number"
                inputMode="numeric"
                min={0}
                step={moneyStep}
                placeholder="0"
                value={row.price}
                onChange={(e) => edit(row.key, { price: e.target.value })}
                className="num"
              />
            </InputGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.firstRun.s1Remove}
              onClick={() => remove(row.key)}
              className="shrink-0 text-muted-foreground"
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => add()}>
          <Plus data-icon="inline-start" aria-hidden />
          {t.firstRun.s1Add}
        </Button>
        {missing.length > 0 && (
          <>
            <span className="ml-1.5 text-xs text-muted-foreground">{t.firstRun.s1Suggest}</span>
            {missing.map((p) => (
              <Button
                key={p.name}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => add(p.name, String(p.price))}
              >
                {p.name}
              </Button>
            ))}
          </>
        )}
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <LoadingButton
        type="button"
        className="w-full"
        busy={pending}
        label={t.firstRun.s1Cta}
        busyLabel={t.common.saving}
        onClick={submit}
      />
    </div>
  );
}
