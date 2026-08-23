'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Ряд инструментов страницы: поиск, период, состояние, действие.
 * Базовые фильтры видны всегда; расширенные уезжают в лист. Всё в
 * одной высоте (36px), чтобы ряд читался одной строкой.
 */
export function Toolbar({
  children,
  end,
  className,
}: {
  children?: ReactNode;
  /** что стоит у правого края: сброс, добавить */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** Поле поиска с лупой и крестиком очистки. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false,
  id,
  numeric = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  /** номера машин: табличные цифры и без автозамены */
  numeric?: boolean;
}) {
  const t = useT();
  const label = placeholder ?? t.common.search;
  return (
    <InputGroup className={cn('w-full sm:w-64', className)}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className={cn(numeric && 'num', '[&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={t.common.clear} onClick={() => onChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/** Кнопка сброса фильтров с числом активных. */
export function ResetFilters({ count, onReset }: { count: number; onReset: () => void }) {
  const t = useT();
  if (count === 0) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onReset}>
      <X data-icon="inline-start" />
      {t.common.clear}
      <span className="num rounded-sm bg-muted px-1 text-2xs text-muted-foreground">{count}</span>
    </Button>
  );
}
