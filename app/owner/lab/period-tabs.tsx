'use client';

import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Период вкладками shadcn.
 *
 * Раньше здесь стояли ссылки с `Badge` — они выглядели метками, а не
 * органом управления. `Tabs` рисует дорожку с подсветкой выбранного,
 * ровно как наша, только реализацией библиотеки: состояние, роли для
 * читалки экрана и переход стрелками достаются даром.
 *
 * Адрес всё равно меняется: период должен переживать обновление
 * страницы и уходить в закладку. Поэтому вкладка не хранит состояние
 * сама, а толкает роутер — вид от библиотеки, поведение продукта.
 */
export function PeriodTabsLab({
  periods,
  current,
}: {
  periods: { key: string; label: string }[];
  current: string;
}) {
  const router = useRouter();

  return (
    <Tabs
      value={current}
      onValueChange={(key) => router.push(key === 'today' ? '/owner/lab' : `/owner/lab?p=${key}`)}
    >
      <TabsList>
        {periods.map((p) => (
          <TabsTrigger key={p.key} value={p.key}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
