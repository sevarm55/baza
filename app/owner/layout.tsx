import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { Rail } from '@/components/rail';
import { Logo } from '@/components/logo';
import { Bell } from '@/components/bell';
import { MobileHead } from '@/components/mobile-head';
import { MobileTabs } from '@/components/mobile-tabs';
import { PointSwitcher } from '@/components/point-switcher';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { getAlerts } from '@/lib/alerts';
import { passesEnabled } from '@/lib/features';
import { getSetup } from '@/lib/onboarding';
import { phoneTab } from '@/components/mobile-place';
import { getDict } from '@/lib/i18n/server';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/session-ended');
  // отключённый бизнес не пускаем внутрь вообще
  if (!currentAccess(tenant).canRead) redirect('/blocked');

  const points = me.accountId ? await listPoints(me.accountId) : [];
  const passes = passesEnabled();

  /* Поводы считаются здесь, в раскладке: колокольчик стоит на каждой
     странице кабинета, и число на нём должно совпадать с тем, что
     человек увидит внутри, на какой бы странице он ни нажал. */
  const alerts = await getAlerts(tenant.id, me.id, tenant.timezone, t.locale);
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  /* Следующий шаг настройки — одна точка в меню, пока она не закончена.
     Считается тем же кодом, что и блок на главной, и в одном запросе с
     ним: два независимых чтения могли бы разойтись, и меню подсветило бы
     раздел, которого на странице уже нет (см. lib/onboarding.ts).

     Последний шаг — первая машина — ведёт на экран смены, а его в меню
     разделов нет: он корневой экран, у него своё место. Точки для него в
     колонке поэтому не будет, и это верно — блок на главной в этот
     момент уже показывает единственную оставшуюся кнопку. */
  const setup = await getSetup(tenant, me);
  const hint = setup.visible ? (setup.next?.href ?? null) : null;

  /* Больше одной точки — переключатель вместо названия. Условие стоит
     здесь, а не внутри компонента: у кого мойка одна, тот не должен
     узнать, что бывают вторые. */
  const many = points.length > 1;

  /* Два способа показать одно и то же.

     На компьютере кабинет — рабочая панель: разделы стоят слева
     неподвижно, полотно занимает всё остальное.

     На телефоне разделы уходят вниз, под большой палец, а шапка
     начинает называть место и уметь вернуть назад. Это схема
     приложения, перенесённая целиком: там она проверена на людях,
     которые открывают продукт мокрыми руками между машинами.
     Гамбургера больше нет — он превращал любой переход в два нажатия и
     один экран, который надо прочитать.

     Переключает не состояние, а ширина окна: обе разметки лежат в
     дереве всегда, и переход между ними ничего не перезагружает. */
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Rail
        tenantName={tenant.name}
        userName={me.name}
        points={points}
        currentTid={tenant.id}
        passes={passes}
        active="owner"
        alerts={alerts}
        hint={hint}
      />

      {/* `board` здесь не ради фона — он уже задан классом рядом, — а
          ради тонов, которые этот класс объявляет: поверхность, линия,
          подсветка строки и заливка поля (см. globals.css, «полотно —
          среда»).

          Класс потерялся, когда колонка переехала на shadcn: разметка
          `.shell > .rail + .canvas` уступила место `SidebarProvider`, и
          вместе с ней ушёл единственный узел, на котором эти тоны
          назывались. Полгода кабинет жил на корневых значениях, и
          заметнее всего это было на формах: поле брало запасной серый
          #f4f4f5, подложка прибора — те же пять процентов чернил, и
          место ввода сливалось с коробкой вокруг него. Отсюда и брались
          «одинаковые серые прямоугольники»: иерархии страница → прибор →
          поле не существовало, потому что второй и третий уровень были
          одного цвета. */}
      <SidebarInset className="board min-w-0 text-[color:var(--on-board)]">
        {/* Шапка телефона решает по адресу, чем ей быть: на корневом
            экране это бизнес и колокольчик, внутри раздела — стрелка
            назад и его название. Обе половины приезжают отсюда готовыми:
            переключатель точек и колокольчик считаются на сервере, а
            выбирает между ними уже браузер, знающий адрес. */}
        <MobileHead
          brand={
            many ? (
              <div className="min-w-0 flex-1">
                <PointSwitcher points={points} currentId={tenant.id} subtitle={me.name} />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Logo size={26} withName={false} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] leading-tight font-semibold">
                    {tenant.name}
                  </div>
                  <div
                    className="truncate text-[11.5px] leading-tight"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    {me.name}
                  </div>
                </div>
              </div>
            )
          }
          actions={<Bell alerts={alerts} />}
        />

        <div className="canvas">
          <div className="canvas-inner">
            <BillingBanner access={currentAccess(tenant)} role="owner" />
            {children}
          </div>
        </div>

        <MobileTabs hint={hint ? phoneTab(hint) : null} />
      </SidebarInset>
    </SidebarProvider>
  );
}
