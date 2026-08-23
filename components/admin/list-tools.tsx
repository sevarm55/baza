'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useA } from '@/lib/i18n/admin/client';

/** Поиск по списку: обычная форма GET, выбор живёт в адресе. */
export function SearchForm({
  defaultValue,
  placeholder,
  hidden = {},
  action,
}: {
  defaultValue: string;
  placeholder: string;
  hidden?: Record<string, string>;
  action?: string;
}) {
  const a = useA();
  return (
    <form method="get" action={action} className="w-full max-w-sm" role="search">
      {Object.entries(hidden)
        .filter(([, v]) => v && v !== 'all' && v !== 'created')
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <InputGroup className="h-8">
        <InputGroupAddon>
          <Search className="size-4 text-muted-foreground" aria-hidden />
        </InputGroupAddon>
        <InputGroupInput name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label={a.common.search} />
      </InputGroup>
    </form>
  );
}

/** Сортировка списком: каждая строка знает свой адрес. */
export function SortSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <NativeSelect
      size="sm"
      aria-label={label}
      value={value}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href);
      }}
    >
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
