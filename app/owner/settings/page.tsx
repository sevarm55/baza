import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, getUser } from '@/lib/queries';
import { accountOf } from '@/lib/accounts';
import { deleteNeedsCode } from '@/lib/account';
import { maskPhone } from '@/lib/phone';
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
  searchParams: Promise<{ s?: string; delete?: string; cid?: string }>;
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

  /* Чем человек подтверждает удаление, решает состояние его аккаунта, а
     не форма: у заведённых по коду из SMS кода-PIN нет вовсе, и вопрос
     «введите свой PIN» был бы для них неотвечаемым (см. lib/account.ts). */
  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');
  const account = await accountOf(me);
  const byCode = deleteNeedsCode(account);

  /* Маршрут удаления возвращает сюда с причиной отказа: показать её
     формой он не может — ответом уходит либо файл, либо редирект. */
  const failure = asked.delete;
  /* Заявка на код живёт в адресе. Сама по себе она ничего не открывает:
     код приходит на телефон, а без него строка бесполезна. */
  const challengeId = failure === 'sent' || failure === 'code' ? (asked.cid ?? '') : '';

  const deleteError =
    failure === 'pin'
      ? t.settings.deleteWrongPin
      : failure === 'throttled'
        ? t.settings.deleteThrottled
        : failure === 'code'
          ? t.settings.deleteCodeWrong
          : failure === 'codeExpired'
            ? t.settings.deleteCodeExpired
            : failure === 'sms'
              ? t.settings.deleteSmsFailed
              : failure && failure !== 'sent'
                ? t.settings.deleteFailed
                : null;

  return (
    <>
      <PageHead title={t.owner.tabSettings} meta={t.settings.lead} />

      {/* Одна колонка, и удаление в самом низу.

          Было две: слева бизнес и выгрузка, справа «удалить бизнес» — то
          есть самое разрушительное действие продукта стояло ПЕРВЫМ в
          правой колонке, вровень с полем названия и одного с ним веса.
          Рядом с ним при этом зияли пятьсот точек пустоты: больше в той
          колонке ничего не было.

          Настройки — это форма, а форму читают одним столбцом сверху
          вниз, и разрушительное в ней идёт последним, после всего, что
          человек пришёл сделать. Ширина столбца ограничена: поле ввода
          в метр шириной не становится удобнее, оно становится длиннее. */}
      <div className="grid max-w-[46rem] gap-[var(--seam)]">
        <div className="grid content-start gap-[var(--seam)]">
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

        <DangerZone
          deleteError={deleteError}
          byCode={byCode}
          challengeId={challengeId}
          phone={maskPhone(account.phone)}
          codeSent={failure === 'sent' || failure === 'code'}
        />
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
async function DangerZone({
  deleteError,
  byCode,
  challengeId,
  phone,
  codeSent,
}: {
  deleteError: string | null;
  /** у человека нет PIN: подтверждать он будет кодом из SMS */
  byCode: boolean;
  challengeId: string;
  /** куда ушёл код — номер показывается закрытым */
  phone: string;
  codeSent: boolean;
}) {
  const t = await getDict();

  /* Три состояния формы вместо одного:
       есть PIN            — поле кода-пароля, как было;
       нет PIN, код не слан — одна кнопка «выслать код»;
       нет PIN, код слан    — поле кода и оба выхода.

     Второе состояние существует ради честности: пока SMS не ушла,
     показывать пустое поле кода значит просить ввести то, чего у
     человека нет. */
  const askCode = byCode && codeSent;
  const askSend = byCode && !codeSent;

  /* Подложка и поле — те же, что у прибора, а не `.card`: на странице,
     где всё остальное собрано из приборов, карточка с другим полем
     читается деталью из другого набора. */
  return (
    <details
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      open={deleteError !== null || codeSent}
    >
      <summary className="cursor-pointer text-[14px] font-semibold">
        {t.settings.deleteTitle}
      </summary>

      <p className="note mt-3">{t.settings.deleteWhat}</p>
      <p className="note note-warn mt-1.5 font-semibold">{t.settings.deleteNoWayBack}</p>

      <form method="post" action="/owner/settings/delete" className="mt-3.5 grid gap-2.5">
        {askSend ? (
          <>
            <p className="note">{t.settings.deleteCodeAsk}</p>
            {deleteError && <p className="alert">{deleteError}</p>}
            {/* Первый шаг ничего не удаляет: он только высылает код.
                Поэтому и кнопка одна, и она не разрушительная. */}
            <button className="btn" name="mode" value="code">
              {t.settings.deleteSendCode}
            </button>
          </>
        ) : (
          <>
            {askCode ? (
              <>
                <input type="hidden" name="challengeId" value={challengeId} />
                <FormField id="delete-code" label={t.settings.deleteCodeAsk}>
                  <input
                    id="delete-code"
                    className="field"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    /* Тот же autoComplete, что на входе: браузер и телефон
                       подставляют код из только что пришедшей SMS сами. */
                    autoComplete="one-time-code"
                    required
                  />
                </FormField>
                <p className="note">{t.settings.deleteCodeSent(phone)}</p>
              </>
            ) : (
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
            )}

            {deleteError && <p className="alert">{deleteError}</p>}

            {/* Сохраняющий путь первым: по умолчанию человек уносит свои
                данные с собой, а не теряет их молча. */}
            <button className="btn" name="mode" value="keep">
              {t.settings.deleteKeep}
            </button>
            <button className="btn btn-ghost text-bad" name="mode" value="wipe">
              {t.settings.deleteWipe}
            </button>
          </>
        )}
      </form>

      <p className="note mt-2.5">{t.settings.deleteHint}</p>
    </details>
  );
}
