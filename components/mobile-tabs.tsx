'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Banknote, ChartNoAxesCombined, ClipboardList, LayoutGrid } from 'lucide-react';
import { phoneTab, type PhoneTab } from '@/components/mobile-place';
import { usePendingTab } from '@/components/use-pending-tab';
import { useT } from '@/lib/i18n/client';

/**
 * Разделы под большим пальцем.
 *
 * На компьютере разделы стоят слева неподвижным списком, и их там
 * девять — места хватает, а глаз всё равно бежит по колонке сверху
 * вниз. На телефоне списка нет: он уехал в выдвижную колонку за
 * гамбургером, и любой переход стоил двух нажатий и одного экрана,
 * который надо прочитать. Продукт, где до зарплат добираются через
 * меню, ощущается сайтом, открытым с телефона, а не приложением.
 *
 * Здесь четыре вкладки, и это ровно те же четыре, что в приложении:
 * смена, сводка, зарплата и всё остальное. Число не случайное — столько
 * экранов открывают каждый день. Прейскурант правят раз в месяц,
 * настройки раз в год; им место в «Ավելին», а не в панели, где они
 * отбирали бы ширину у ежедневных.
 *
 * Панель выполнена языком веба, а не системной панелью телефона: те же
 * тона полотна, тот же угол в восемь точек и та же сиреневая подсветка
 * «вы находитесь здесь», что у вкладок периода на сводке. Продукт
 * остаётся собой — переносится расположение, а не чужая внешность.
 */

const TABS = [
  { href: '/work', icon: ClipboardList },
  { href: '/owner', icon: ChartNoAxesCombined },
  { href: '/owner/payroll', icon: Banknote },
  { href: '/owner/more', icon: LayoutGrid },
] as const;

export function MobileTabs({
  hint,
}: {
  /**
   * Мобильный ответ точке в боковой колонке.
   *
   * Вкладок четыре, а разделов девять, и следующий шаг настройки чаще
   * всего лежит не во вкладке, а за «Ավելին». Поэтому сюда приезжает уже
   * переведённый адрес — той вкладки, через которую до шага доходят
   * (см. `phoneTab`), а не самого раздела: точка обязана стоять там, куда
   * человек нажмёт.
   */
  hint?: string | null;
} = {}) {
  const t = useT();
  const pathname = usePathname();
  const current = phoneTab(pathname) ?? '/owner';
  const { active, pending, select } = usePendingTab<PhoneTab>(current);

  const label: Record<string, string> = {
    '/work': t.phone.tabShift,
    '/owner': t.phone.tabSummary,
    '/owner/payroll': t.phone.tabPayroll,
    '/owner/more': t.phone.tabMore,
  };

  return (
    <nav className="tabbar" aria-label={t.phone.tabsAria}>
      {TABS.map((tab) => {
        const on = active === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={() => select(tab.href)}
            aria-current={on ? 'page' : undefined}
            data-on={on ? '' : undefined}
            data-pending={pending && on ? '' : undefined}
            className="tabbar-item"
          >
            <Icon className="size-5" aria-hidden strokeWidth={on ? 2.2 : 1.8} />
            <span>{label[tab.href]}</span>
            {hint === tab.href && (
              <span className="hint-dot hint-dot-tab">
                <span className="sr-only">{t.setup.hintAria}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
