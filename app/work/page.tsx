import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureDb } from '@/lib/db/ready';
import { getShift, getTenant, getUser, listServices, startOfDay } from '@/lib/queries';
import { currentShift } from '@/lib/shifts';
import { listPoints } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { TopBar } from '@/components/top-bar';
import { Rail } from '@/components/rail';
import { Logo } from '@/components/logo';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Grid, Reading, Tile } from '@/components/board';
import { passesEnabled } from '@/lib/features';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { ShiftToggle } from '@/components/shift-toggle';
import { OrderFlow } from './order-flow';
import { JobQueue } from '@/components/job-queue';
import { listMyJobs } from '@/lib/jobs';

export default async function WorkPage() {
  const session = await requireSession();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/session-ended');

  const access = currentAccess(tenant);
  if (!access.canRead) redirect('/blocked');
  const [services, shift, open, points, myJobs] = await Promise.all([
    listServices(tenant.id),
    getShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    currentShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    me.accountId ? listPoints(me.accountId) : Promise.resolve([]),
    listMyJobs(tenant.id, me.id),
  ]);

  /* Владелец приходит сюда из кабинета, поэтому у него остаётся боковая
     колонка: на маленькой мойке он моет сам и переключается между двумя
     половинами продукта по десять раз за день. У мойщика разделов нет —
     ему колонка не нужна, у него шапка. */
  const owner = session.role === 'owner';
  const onShift = Boolean(open);
  const sidebarOpen = owner
    ? (await cookies()).get('sidebar_state')?.value !== 'false'
    : true;

  /* Экран смены на языке табло — одной колонкой, а не разложенный по
     ширине монитора.

     Содержимого здесь четыре вещи: сколько заработал, сколько машин и
     денег, кнопка записи и журнал. Кабинет живёт во всю ширину, потому
     что там десять приборов и им тесно; здесь четыре, и растянутые на
     тысячу триста пикселей они читаются не как экран, а как остатки
     экрана — глаз ищет то, что должно было стоять в пустоте справа и
     снизу. Ограниченный столбец такого вопроса не задаёт: видно, где
     содержимое кончается, и что оно кончилось нарочно.

     Это и по сути правильно. Кабинет — приборная панель, её изучают.
     Смена — рабочее место для одной руки: пришёл, посмотрел цифру,
     записал машину, ушёл. На телефоне оно и так одной колонкой, и
     разница между телефоном и монитором тут должна быть в размере
     полей, а не в устройстве экрана.

     Порядок задан частотой: записать машину — десятки раз за смену,
     заработок — после каждой, состояние смены — дважды в день, журнал —
     когда ошибся. */
  const body = (
    <>
      <BillingBanner access={access} role={session.role} />

      <div className="mx-auto grid w-full max-w-[46rem] gap-[var(--seam)]">
        <div className="grid content-start gap-[var(--seam)]">
          {/* Переданные машины — выше денег, вопреки правилу «порядок по
              частоте». Частота тут ни при чём: когда владелец отдал
              машину, это единственная причина, по которой мойщик взял
              телефон. Когда назначенных нет, блока нет вовсе, и экран
              возвращается к прежнему порядку. */}
          {/* Смены здесь не требуем нарочно, в отличие от записи. Взять
              машину — не про деньги, а про «я её увидел»: мойщику
              назначают её ровно тогда, когда он ещё идёт к посту и смену
              не открыл. Спрятанная в этот момент кнопка выглядела бы
              поломкой ровно там, где фича должна работать. */}
          <JobQueue
            canWrite={access.canWrite}
            jobs={myJobs.map((j) => ({
              id: j.id,
              clientKey: j.clientKey,
              serviceName: j.serviceName,
              note: j.note,
              status: j.status as 'assigned' | 'accepted' | 'started',
              waited: hy.jobs.waited(j.waitedMinutes),
            }))}
          />

          {/* Свои деньги — тем же прибором, что выручка в кабинете, а не
              собственной градиентной карточкой. Мойщик и владелец
              смотрят на одно и то же число разными глазами, и незачем
              рисовать для этого два разных предмета.

              Состояние смены встало строкой сравнения под цифрой:
              «сколько» и «работаю ли я» читаются одним взглядом, а
              зелёная точка здесь — тот же знак, которым владелец видит
              человека на смене. */}
          <Reading
            caption={hy.work.shiftTitle}
            value={formatMoney(shift.earned, tenant.currency)}
            compare={onShift ? hy.work.onShift : hy.work.offShift}
            tone={onShift ? 'good' : 'warn'}
          />

          <Grid>
            <Tile tone="teal" label={tenant.unitOne} value={shift.count} />
            <Tile
              tone="slate"
              label={hy.owner.revenueToday}
              value={formatMoney(shift.revenue, tenant.currency)}
              note={`${hy.work.yourShare} ${me.percent}%`}
            />
          </Grid>

          {/* Одно действие, и оно никогда не серое.

              Было так: вне смены наверху висела погашенная кнопка
              «+ машина», а объяснение, почему она не работает, стояло в
              другой колонке под случайной линией. Погашенная кнопка без
              объяснения читается поломкой, а с объяснением в стороне —
              поломкой, которую зачем-то описали. Теперь вне смены её
              нет вовсе: следующее действие человека там не «записать», а
              «начать смену», её и показываем.

              На смене всё наоборот: запись становится самым громким на
              экране, а выключатель смены уходит вниз и затихает — его
              жмут дважды в день, а кнопку записи сорок раз. */}
          {!onShift && <ShiftToggle open={false} />}

          {/* Журнал целиком, а не первые шесть. Обрезанный список
              оставлял внизу пустоту, которую нечем занять, и прятал
              ровно то, ради чего в него смотрят: ошибку ищут не среди
              последних шести, а среди всех за смену. */}
          <OrderFlow
            canWrite={access.canWrite && onShift}
            services={services.map((s) => ({ id: s.id, name: s.name, price: s.price }))}
            currency={tenant.currency}
            clientIdLabel={tenant.clientIdLabel}
            clientIdType={tenant.clientIdType}
            addLabel={`+ ${tenant.unitOne}`}
            percent={me.percent}
            timezone={tenant.timezone}
            recent={shift.orders.map((o) => ({
              id: o.id,
              serviceName: o.serviceName,
              price: o.price,
              payment: o.payment,
              at: o.createdAt.toISOString(),
            }))}
            /* Начатые машины идут в тот же журнал: наверху остаётся
               только то, что ещё нужно взять. */
            washing={myJobs
              .filter((j) => j.status === 'started')
              .map((j) => ({
                id: j.id,
                clientKey: j.clientKey,
                serviceName: j.serviceName,
                at: (j.startedAt ?? j.createdAt).toISOString(),
              }))}
          />

          {onShift && <ShiftToggle open />}
        </div>
      </div>
    </>
  );

  if (owner) {
    return (
      <SidebarProvider defaultOpen={sidebarOpen}>
        <Rail
          tenantName={tenant.name}
          userName={me.name}
          points={points}
          currentTid={tenant.id}
          passes={passesEnabled()}
          active="work"
        />
        <SidebarInset className="min-w-0 bg-board text-[color:var(--on-board)]">
          <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/92 px-3 backdrop-blur md:hidden">
            <SidebarTrigger aria-label={hy.common.expand} title={hy.common.expand} />
            <Logo size={24} withName={false} />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{tenant.name}</div>
              <div className="truncate text-[11.5px] text-sidebar-foreground/55">{me.name}</div>
            </div>
          </header>
          <div className="canvas">
            <div className="canvas-inner">{body}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <div className="shell shell-solo">
      <div className="min-w-0">
        <TopBar
          tenantName={tenant.name}
          subtitle={me.name}
          role={session.role}
          active="work"
          points={points}
          currentTid={tenant.id}
        />
        <main className="canvas">
          <div className="canvas-inner">{body}</div>
        </main>
      </div>
    </div>
  );
}
