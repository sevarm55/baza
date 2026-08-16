import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant } from '@/lib/queries';
import { Panel } from '@/components/board';
import { FormField } from '@/components/form-field';
import { PageHead } from '@/components/page-head';
import { BusinessForm } from './business-form';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull } from '@/lib/i18n/terms';

/**
 * Настройки.
 *
 * Раздел годами был контейнером для чужого: главным, что в нём лежало,
 * был прейскурант — рабочая сущность, которую правят чаще всего
 * остального в кабинете. Он уехал в свой раздел (`/owner/services`), и
 * настройки наконец стали настройками: тем, что трогают раз в год.
 *
 * Осталось ровно две работы, и вкладок между ними больше нет. Вкладка
 * оправдана, когда за ней прячут длинный список, ради которого сюда и
 * пришли; две карточки по три строки за двумя вкладками означают только
 * одно — чтобы увидеть выгрузку, надо сначала догадаться, что она
 * существует.
 *
 *   бизнес  — как называется точка и какие у неё филиалы;
 *   данные  — забрать своё и уйти.
 *
 * Ссылки на профиль здесь тоже больше нет. Профиль — не настройка
 * бизнеса, у него своя страница и свой вход из меню пользователя, а
 * второй путь к нему изнутри настроек делал их альтернативным меню.
 * Филиалы остались: у них своего пункта в колонке нет, и настройки
 * бизнеса — их единственный и правильный дом.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; delete?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();

  const asked = await searchParams;
  /* Старый адрес прейскуранта. Ссылку на «услуги» человек мог сохранить
     или отправить сотруднику, и она обязана открывать услуги, а не
     настройки без вкладки, которую в ней ищут. */
  if (asked.s === 'services') redirect('/owner/services');

  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  /* Маршрут удаления возвращает сюда с причиной отказа: показать её
     формой он не может — ответом уходит либо файл, либо редирект. */
  const failure = asked.delete;
  const deleteError =
    failure === 'pin'
      ? t.settings.deleteWrongPin
      : failure === 'throttled'
        ? t.settings.deleteThrottled
        : failure
          ? t.settings.deleteFailed
          : null;

  return (
    <>
      <PageHead title={t.owner.tabSettings} meta={t.settings.lead} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-7">
          <Panel title={t.settings.business}>
            {/* Подпись отдельной строкой и связана с полем по `id`, а не
                обёрткой: внутри своя форма, а форму в `<label>`
                заворачивать нельзя — поле внутри неё перестаёт быть
                подписанным. */}
            <FormField id="business-name" label={t.settings.businessName}>
              <BusinessForm name={tenant.name} />
            </FormField>

            {/* Филиалы — переход, а не действие, и живут строкой в том
                же приборе, что название. Под них был отдельный прибор с
                одной широкой кнопкой. */}
            <div className="rows mt-4">
              <Link className="link-row" href="/owner/points">
                {t.points.title}
              </Link>
            </div>
          </Panel>

          <Panel title={t.settings.export} id="data">
            <p className="text-[14px]" style={{ color: 'var(--board-muted)' }}>
              {t.settings.exportNote}
            </p>

            <div className="mt-4">
              <a className="btn-inline" href="/owner/export?days=30" download>
                {t.settings.exportCsv}
              </a>
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <DangerZone deleteError={deleteError} />
        </div>
      </div>
    </>
  );
}

/**
 * Удаление бизнеса.
 *
 * За раскрывающимся заголовком и в стороне от всего остального:
 * действие необратимое, и на глаза оно попадаться не должно — его ищут
 * осознанно. Раньше оно лежало прямо под ссылкой на выгрузку, в одной
 * колонке с названием точки.
 */
async function DangerZone({ deleteError }: { deleteError: string | null }) {
  const t = await getDict();
  /* Подложка и поле — те же, что у прибора, а не `.card`: на странице,
     где всё остальное собрано из приборов, карточка с другим полем
     читается деталью из другого набора. */
  return (
    <details
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      open={deleteError !== null}
    >
      <summary className="cursor-pointer text-[14px] font-semibold">
        {t.settings.deleteTitle}
      </summary>

      <p className="note mt-3">{t.settings.deleteWhat}</p>
      <p className="note note-warn mt-1.5 font-semibold">{t.settings.deleteNoWayBack}</p>

      <form method="post" action="/owner/settings/delete" className="mt-3.5 grid gap-2.5">
        <FormField id="delete-pin" label={t.settings.deletePin}>
          <input
            id="delete-pin"
            className="field"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            autoComplete="off"
            required
          />
        </FormField>

        {deleteError && <p className="alert">{deleteError}</p>}

        {/* Сохраняющий путь первым: по умолчанию человек уносит свои
            данные с собой, а не теряет их молча. */}
        <button className="btn" name="mode" value="keep">
          {t.settings.deleteKeep}
        </button>
        <button className="btn btn-ghost text-bad" name="mode" value="wipe">
          {t.settings.deleteWipe}
        </button>
      </form>

      <p className="note mt-2.5">{t.settings.deleteHint}</p>
    </details>
  );
}
