import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { PointForm } from '@/components/point-form';
import { currentAccess } from '@/lib/subscription';
import { hy } from '@/lib/i18n/hy';
import { SignOutButton } from '@/components/sign-out-button';

/**
 * Стена: срок вышел.
 *
 * Раньше просрочка была мягкой — разделы открывались, закрывалась только
 * запись. Выглядело невнятно: продукт сообщал «время прошло» и тут же
 * пускал ходить по экранам и заводить людей. Теперь вместо всего кабинета
 * один экран.
 *
 * Порядок на нём неслучаен. Сначала — что данные целы: тот, кому закрыли
 * доступ, первым делом боится потерять историю, и пока этот страх не снят,
 * остальное он не читает. Потом — как продолжить. И только в конце —
 * забрать данные или уйти совсем.
 *
 * Сотруднику показываем то же, но без кнопок: платит не он, и распоряжаться
 * судьбой бизнеса ему нечем.
 */
export default async function BlockedPage() {
  const session = await requireSession();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const access = currentAccess(tenant);
  // сюда попадают только закрытые: остальных возвращаем в продукт
  if (access.canRead) {
    redirect(session.role === 'owner' ? '/owner' : '/work');
  }

  const isOwner = session.role === 'owner';
  const blocked = access.state === 'blocked';
  /* Точку завели минуту назад, и «Ժամկետը լրացել է» здесь было бы прямой
     неправдой: ничего не истекло, оплаты просто ещё не было. */
  const fresh = access.state === 'unpaid';

  const me = await getUser(session.tid, session.uid);
  const others = me?.accountId
    ? (await listPoints(me.accountId)).filter((p) => p.id !== session.tid)
    : [];

  return (
    <main className="relative flex min-h-dvh w-full flex-col justify-end overflow-hidden">
      {/* Картинка фоном, а не элементом: она не должна влиять на разметку
          и обязана обрезаться, а не растягивать страницу вбок. */}
      <div
        className="absolute inset-0 bg-[#2E1065] bg-cover bg-top"
        style={{ backgroundImage: 'url(/expired.jpg)' }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-[#2E1065]/90 to-[#2E1065]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[440px] px-6 pb-12">
        <h1 className="text-[30px] leading-tight font-bold text-white">
          {fresh ? hy.points.freshTitle : blocked ? hy.billing.blockedTitle : hy.billing.wallTitle}
        </h1>

        <p className="mt-3.5 text-[17px] leading-relaxed text-white/80">
          {fresh ? hy.points.freshText : blocked ? hy.billing.blockedText : hy.billing.wallLead}
        </p>

        {/* Одна закрытая точка не имеет права запирать открытую. Без этого
            владелец, заведший вторую мойку, упирался бы в стену и терял
            доступ к первой — работающей и оплаченной. */}
        {others.length > 0 && (
          <div className="mt-5 rounded-[10px] border border-white/15 p-[3px]">
            {others.map((point) => (
              <PointForm key={point.id} tid={point.id}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2.5 text-left text-white"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      point.canRead ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    {point.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-white/50">
                    {point.canRead ? hy.points.go : hy.points.needsPayment}
                  </span>
                </button>
              </PointForm>
            ))}
          </div>
        )}

        <p className="mt-5 text-[15px] text-white/70">{hy.billing.wallContinue}</p>
        {/* Звонок — главное действие: продолжить пользоваться хотят обе стороны */}
        {/* Цвета фирменные, а не тематические: экран всегда тёмный —
            под ним картинка, — и переменные светлой темы дали бы здесь
            невидимую кнопку. Тот же лайм, что у главной кнопки в
            приложении. */}
        <a
          href="tel:+37499855546"
          className="mt-2 block rounded-[10px] py-4 text-center text-[17px] font-bold no-underline"
          style={{ backgroundColor: '#D7FF00', color: '#2E1065' }}
        >
          {hy.billing.wallPhone}
        </a>

        {isOwner && (
          <>
            {/* Выгружать у новой точки нечего — она пустая. А удаление
                оставляем: точку могли завести по ошибке, и без него она
                висела бы в списке навсегда. */}
            <div className={`mt-4 flex gap-3 ${fresh ? 'hidden' : ''}`}>
              {/* За всё время: человек уходит, и отдать ему тридцать дней
                  вместо всей истории было бы обманом */}
              <a
                href="/owner/export?days=all"
                download
                className="flex-1 rounded-[10px] border border-white/20 py-3 text-center text-[15px] font-semibold text-white no-underline"
              >
                {hy.billing.wallDownload}
              </a>
            </div>

            {/* Форма прямо здесь, а не ссылкой в настройки: настройки
                закрыты вместе со всем кабинетом, и ссылка вела бы обратно
                на эту же стену. За раскрывающимся заголовком — удаление
                необратимо и на глаза попадаться не должно. */}
            <details className="mt-4">
              <summary className="cursor-pointer text-[15px] font-semibold text-white/70">
                {hy.billing.wallDelete}
              </summary>

              <p className="mt-2 text-[13.5px] text-white/45">{hy.billing.wallDeleteNote}</p>

              <form
                method="post"
                action="/owner/settings/delete"
                className="mt-3 flex items-center gap-2"
              >
                <input
                  className="field field-sm min-w-0 flex-1"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  maxLength={6}
                  autoComplete="off"
                  aria-label={hy.settings.deletePin}
                  placeholder={hy.settings.deletePin}
                  required
                />
                <button
                  className="shrink-0 rounded-[8px] border border-white/25 px-3 py-2 text-[13.5px] font-semibold text-white/80"
                  name="mode"
                  value="wipe"
                >
                  {hy.settings.deleteWipe}
                </button>
              </form>
            </details>
          </>
        )}

        <div className="mt-7 flex items-center justify-between">
          <span className="text-[13.5px] text-white/45">{tenant.name}</span>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
