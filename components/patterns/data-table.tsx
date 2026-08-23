'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TableShell } from './table';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** числа и деньги справа */
  align?: 'left' | 'right' | 'center';
  /** значение для сортировки; без него колонка не сортируется */
  sortValue?: (row: T) => number | string | null;
  className?: string;
  headClassName?: string;
  /** скрыть на узком экране */
  hideBelow?: 'sm' | 'md' | 'lg';
  width?: string;
};

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

/**
 * Таблица данных: компактная, с сортировкой по щелчку на заголовок,
 * с открытием строки по щелчку. Строка открывается целиком, а с
 * клавиатуры доступна через первую ячейку: на `<tr>` нет ни `role`,
 * ни `tabIndex` (это ломает гидратацию), вместо них кнопка внутри.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  empty,
  defaultSort,
  dense = false,
  className,
  title,
  actions,
  footer,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** подпись кнопки-открывашки для чтеца: «AA 123 · открыть» */
  rowLabel?: (row: T) => string;
  empty?: ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  dense?: boolean;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'desc' };
      if (s.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  }

  return (
    <TableShell className={className} title={title} actions={actions} footer={footer}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => {
              const sortable = !!c.sortValue;
              const on = sort?.key === c.key;
              return (
                <TableHead
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    'h-9 px-4 text-xs font-medium text-muted-foreground',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.hideBelow && HIDE[c.hideBelow],
                    c.headClassName,
                  )}
                  aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                        on && 'text-foreground',
                      )}
                    >
                      {c.header}
                      {on ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && empty !== undefined && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={
                onRowClick
                  ? (e) => {
                      const el = e.target as HTMLElement;
                      if (el.closest('button, a, input, [role=menuitem], [data-no-row-click]')) return;
                      onRowClick(row);
                    }
                  : undefined
              }
              className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
            >
              {columns.map((c, i) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    'px-4',
                    dense ? 'py-2' : 'py-2.5',
                    c.align === 'right' && 'num text-right',
                    c.align === 'center' && 'text-center',
                    c.hideBelow && HIDE[c.hideBelow],
                    c.className,
                  )}
                >
                  {i === 0 && onRowClick ? (
                    <span className="relative">
                      {c.cell(row)}
                      {/* Клавиатурный вход в строку: невидимая кнопка во
                          всю первую ячейку. */}
                      <button
                        type="button"
                        data-no-row-click
                        className="absolute inset-0 cursor-pointer rounded-sm opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={rowLabel?.(row)}
                        onClick={() => onRowClick(row)}
                      />
                    </span>
                  ) : (
                    c.cell(row)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}
