/**
 * Строки приложения — и генератор строкового каталога iOS.
 *
 * Живёт рядом с веб-словарём намеренно. Продукт один, и слова в нём
 * обязаны совпадать: «Ձեզ մնում է» на сайте и в приложении — это одна
 * строка, а не две похожие. Поэтому всё, что уже сказано в `lib/i18n`,
 * приложение берёт оттуда по тому же ключу, и разъехаться им негде.
 *
 * Здесь — только то, чего на сайте нет: экраны, которых у веба не бывает
 * (замок по лицу, сканер номера, онбординг, виджет), и подписи, которые
 * на телефоне звучат иначе, чем на большом экране.
 *
 * Запуск:  npx tsx scripts/ios-strings.ts
 * Итог:    ios/Tetr/Localizable.xcstrings
 */

import fs from 'node:fs';
import path from 'node:path';
import { hy } from '../lib/i18n/hy';
import { ru } from '../lib/i18n/ru';
import { en } from '../lib/i18n/en';

type Row = { hy: string; ru: string; en: string };

/* ------------------------------------------------------------------ *
 * Строки, которых на сайте нет                                        *
 * ------------------------------------------------------------------ */

export const IOS_ONLY: Record<string, Row> = {
  /* --- вкладки. Короткие: подпись под значком ломается на втором слове,
     и «Աշխատավարձեր» пришлось бы жать до нечитаемого. --- */
  'tab.shift': { hy: 'Հերթափոխ', ru: 'Смена', en: 'Shift' },
  'tab.summary': { hy: 'Ամփոփում', ru: 'Сводка', en: 'Summary' },
  'tab.payroll': { hy: 'Աշխատավարձ', ru: 'Зарплата', en: 'Payroll' },
  'tab.more': { hy: 'Ավելին', ru: 'Ещё', en: 'More' },

  /* --- замок по лицу и отпечатку --- */
  'lock.code': { hy: 'կոդ', ru: 'код', en: 'passcode' },
  'lock.unlock': { hy: 'Բացել Tetrin-ը', ru: 'Разблокировать Tetrin', en: 'Unlock Tetrin' },
  'lock.unlockWith': { hy: 'Բացել %@-ով', ru: 'Разблокировать через %@', en: 'Unlock with %@' },
  'lock.usePhone': { hy: 'Մուտք գործել հեռախոսով', ru: 'Войти кодом телефона', en: 'Use phone passcode' },
  'lock.failed': {
    hy: '%@-ը չհաստատվեց։ Մուտքագրեք մուտքի կոդը։',
    ru: '%@ не подтвердил. Введите код доступа.',
    en: '%@ did not confirm. Enter your access code.',
  },

  /* --- общее --- */
  'common.loadingShort': { hy: 'Բեռնվում է', ru: 'Загрузка', en: 'Loading' },
  'common.ok': { hy: 'Լավ', ru: 'Хорошо', en: 'OK' },
  'common.failed': { hy: 'Չհաջողվեց', ru: 'Не получилось', en: "Didn't work" },
  'common.other': { hy: 'Այլ', ru: 'Другое', en: 'Other' },
  'common.next': { hy: 'Հաջորդը', ru: 'Дальше', en: 'Next' },
  'common.skip': { hy: 'Բաց թողնել', ru: 'Пропустить', en: 'Skip' },
  'common.start': { hy: 'Սկսել', ru: 'Начать', en: 'Start' },
  'common.preparing': { hy: 'Պատրաստվում է…', ru: 'Готовится…', en: 'Preparing…' },
  'common.you': { hy: 'դուք', ru: 'вы', en: 'you' },
  /* Пусто в клетке календаря: одно слово, а не фраза «Դեռ տվյալներ չկան». */
  'common.emptyCell': { hy: 'դատարկ', ru: 'пусто', en: 'empty' },

  /* --- ошибки связи. Приложение теряет сеть на площадке постоянно, и
     это не поломка: об этом надо сказать словом, а не кодом. --- */
  'errors.offline': { hy: 'Կապ չկա։', ru: 'Нет связи.', en: 'No connection.' },
  'errors.server': {
    hy: 'Սերվերը չպատասխանեց (%@)։',
    ru: 'Сервер не ответил (%@).',
    en: 'The server did not respond (%@).',
  },
  'errors.failedCode': { hy: 'Չհաջողվեց (%@)', ru: 'Не получилось (%@)', en: "Didn't work (%@)" },
  'errors.appNewer': {
    hy: 'Հավելվածն ավելի նոր է, քան սերվերը։',
    ru: 'Приложение новее, чем сервер.',
    en: 'The app is newer than the server.',
  },

  /* --- сводка владельца: подписи периода. Период стоит в самой фразе,
     потому что на телефоне переключатель периода уезжает за край при
     прокрутке, а число остаётся. --- */
  'summary.keptMonth': { hy: 'Այս ամիս ձեզ մնում է', ru: 'В этом месяце вам остаётся', en: 'You keep this month' },
  'summary.redMonth': { hy: 'Այս ամիս մինուսի մեջ եք', ru: 'В этом месяце вы в минусе', en: "You're in the red this month" },
  'summary.keptPrevMonth': { hy: 'Անցյալ ամիս ձեզ մնացել է', ru: 'В прошлом месяце вам осталось', en: 'You kept last month' },
  'summary.redPrevMonth': { hy: 'Անցյալ ամիս մինուսում էիք', ru: 'В прошлом месяце вы были в минусе', en: 'You were in the red last month' },
  'summary.keptToday': { hy: 'Այսօր ձեզ մնում է', ru: 'Сегодня вам остаётся', en: 'You keep today' },
  'summary.redToday': { hy: 'Այսօր մինուսի մեջ եք', ru: 'Сегодня вы в минусе', en: "You're in the red today" },
  'summary.paidMonth': { hy: 'Այս ամիս վճարել են', ru: 'В этом месяце заплатили', en: 'Paid this month' },
  'summary.paidPrevMonth': { hy: 'Անցյալ ամիս վճարել են', ru: 'В прошлом месяце заплатили', en: 'Paid last month' },
  'summary.paidToday': { hy: 'Այսօր վճարել են', ru: 'Сегодня заплатили', en: 'Paid today' },
  'summary.spentMonth': { hy: 'Այս ամիս ծախսվել է', ru: 'В этом месяце потрачено', en: 'Spent this month' },
  'summary.spentPrevMonth': { hy: 'Անցյալ ամիս ծախսվել է', ru: 'В прошлом месяце потрачено', en: 'Spent last month' },
  'summary.spentToday': { hy: 'Այսօր ծախսվել է', ru: 'Сегодня потрачено', en: 'Spent today' },
  'summary.paidIn': { hy: 'Վճարել են', ru: 'Заплатили', en: 'Paid in' },
  'summary.toStaff': { hy: 'Աշխատակիցներին', ru: 'Сотрудникам', en: 'To staff' },
  'summary.served': { hy: 'Սպասարկվել է', ru: 'Обслужено', en: 'Served' },
  'summary.inPeriod': { hy: 'այս ժամանակահատվածում', ru: 'за этот период', en: 'in this period' },
  'summary.avgPayment': { hy: 'Միջին վճարումը', ru: 'Средний платёж', en: 'Average payment' },
  'summary.paymentsDay': { hy: 'Օրվա վճարումները', ru: 'Платежи за день', en: "The day's payments" },
  'summary.paymentsMonth': { hy: 'Ամսվա վճարումները', ru: 'Платежи за месяц', en: "The month's payments" },
  'summary.perOne': { hy: 'մեկ %@', ru: 'с одного %@', en: 'per %@' },
  'summary.share': { hy: 'Բաժին %@', ru: 'Доля %@', en: 'Share %@' },
  'summary.toBusiness': { hy: 'Բիզնեսին %@', ru: 'Бизнесу %@', en: 'To the business %@' },
  'summary.vsLastWeek': { hy: 'մեկ շաբաթ առաջ այս ժամին', ru: 'неделю назад в это же время', en: 'a week ago at this hour' },
  'summary.vsPrevMonth': { hy: 'նախորդ ամիս', ru: 'прошлый месяц', en: 'last month' },
  'summary.since': { hy: '%@-ից', ru: 'с %@', en: 'since %@' },
  'summary.onShiftSince': { hy: '%1$@ հերթափոխին %2$@', ru: '%1$@ на смене %2$@', en: '%1$@ on shift %2$@' },
  'summary.voiceover': {
    hy: 'Հասույթ %1$@, ծախս %2$@, աշխատակիցներին %3$@',
    ru: 'Выручка %1$@, расходы %2$@, сотрудникам %3$@',
    en: 'Revenue %1$@, expenses %2$@, to staff %3$@',
  },

  /* --- календарь и день --- */
  'calendar.title': { hy: 'Օրացույց', ru: 'Календарь', en: 'Calendar' },
  'calendar.lead': { hy: 'Օրեր, ամիսներ, ամբողջ պատմությունը', ru: 'Дни, месяцы, вся история', en: 'Days, months, the whole history' },
  'calendar.nextMonth': { hy: 'Հաջորդ ամիս', ru: 'Следующий месяц', en: 'Next month' },
  'calendar.monthProfit': { hy: 'Ամսվա շահույթ', ru: 'Прибыль за месяц', en: "The month's profit" },
  'calendar.monthInTheRed': { hy: 'Ամիսը մինուսում', ru: 'Месяц в минусе', en: 'The month is in the red' },
  'calendar.weekShape': { hy: 'Շաբաթվա պատկերը', ru: 'Картина недели', en: 'The shape of the week' },
  'day.empty': { hy: 'Այս օրը գրանցումներ չկան', ru: 'В этот день записей нет', en: 'No records on this day' },
  'day.kept': { hy: 'Այդ օրը ձեզ մնաց', ru: 'В тот день вам осталось', en: 'That day you kept' },
  'day.red': { hy: 'Այդ օրը մինուսում էիք', ru: 'В тот день вы были в минусе', en: 'That day you were in the red' },
  'day.records': { hy: 'Գրանցումներ', ru: 'Записи', en: 'Records' },
  'day.loadFailed': { hy: 'Չհաջողվեց բացել օրը', ru: 'Не удалось открыть день', en: "Couldn't open the day" },
  'day.cashInShift': { hy: 'Կանխիկ %@', ru: 'Наличные %@', en: 'Cash %@' },
  'day.handedOver': { hy: '· հանձնեց %@', ru: '· сдал %@', en: '· handed over %@' },
  'day.notDeclared': { hy: '· հանձնումը չի նշվել', ru: '· сдачу не отметил', en: '· handover not stated' },

  /* --- смена мойщика --- */
  'shift.greetingMorning': { hy: 'Բարի լույս', ru: 'Доброе утро', en: 'Good morning' },
  'shift.greetingDay': { hy: 'Բարի օր', ru: 'Добрый день', en: 'Good afternoon' },
  'shift.greetingEvening': { hy: 'Բարի երեկո', ru: 'Добрый вечер', en: 'Good evening' },
  'shift.greetingPlain': { hy: 'Բարև', ru: 'Здравствуйте', en: 'Hello' },
  'shift.offShift': { hy: 'Հերթափոխից դուրս', ru: 'Вне смены', en: 'Off shift' },
  'shift.onShiftSince': { hy: 'Հերթափոխին եմ · %1$@-ից · %2$@', ru: 'Я на смене · с %1$@ · %2$@', en: "I'm on shift · since %1$@ · %2$@" },
  /* Два тире ниже — промежутки «от и до», а не связки: для промежутка
     тире и придумано. Связки из строк продукта убраны, разделителем
     фактов в строке служит точка «·». */
  'shift.doneRange': { hy: 'Հերթափոխն ավարտված է · %1$@ — %2$@', ru: 'Смена завершена · %1$@ — %2$@', en: 'Shift finished · %1$@ — %2$@' },
  'shift.lastedMinutes': { hy: '%lld ր', ru: '%lld мин', en: '%lld min' },
  'shift.lastedHours': { hy: '%1$lld ժ %2$lld ր', ru: '%1$lld ч %2$lld мин', en: '%1$lld h %2$lld min' },
  'shift.cashInHand': { hy: 'Կանխիկ ձեռքին', ru: 'Наличные на руках', en: 'Cash in hand' },
  'shift.yourShare': { hy: 'քո բաժինը՝ %lld%%', ru: 'твоя доля %lld%%', en: 'your share %lld%%' },
  'shift.toHandOver': { hy: 'հանձնելու է վերջում', ru: 'сдать в конце', en: 'to hand over at the end' },
  'shift.record': { hy: 'Գրանցում', ru: 'Запись', en: 'Record' },
  'shift.latest': { hy: 'Վերջինները', ru: 'Последние', en: 'Latest' },
  'shift.rowActions': { hy: 'Գործողություններ՝ %@', ru: 'Действия: %@', en: 'Actions: %@' },
  'shift.revokeBody': {
    hy: '%1$@ · %2$@ · %3$@\nՉեղարկելուց հետո այսօրվա վաստակը կվերահաշվարկվի։',
    ru: '%1$@ · %2$@ · %3$@\nПосле отмены сегодняшний заработок пересчитается.',
    en: "%1$@ · %2$@ · %3$@\nAfter cancelling, today's earnings are recalculated.",
  },

  /* --- сдача наличных --- */
  'handover.cashInShift': { hy: 'Կանխիկ հերթափոխում', ru: 'Наличные за смену', en: 'Cash this shift' },
  'handover.cardNote': {
    hy: 'Քարտով և փոխանցումով վճարածը հանձնելու կարիք չկա։',
    ru: 'Оплаченное картой и переводом сдавать не нужно.',
    en: 'What was paid by card or transfer does not need handing over.',
  },
  'handover.declaring': { hy: 'Հանձնում եմ', ru: 'Сдаю', en: "I'm handing over" },
  'handover.short': { hy: 'Պակասում է %@', ru: 'Не хватает %@', en: 'Short by %@' },
  'handover.over': { hy: 'Ավելի է %@', ru: 'Больше на %@', en: 'Over by %@' },
  'handover.submit': { hy: 'Հանձնել և ավարտել', ru: 'Сдать и завершить', en: 'Hand over and finish' },
  'handover.endNote': {
    hy: 'Ավարտելուց հետո %@ գրանցել կարելի կլինի միայն նոր հերթափոխից հետո։',
    ru: 'После завершения записать %@ можно будет только на новой смене.',
    en: 'After it ends you can log %@ only on a new shift.',
  },

  /* --- вход --- */
  'auth.signInAs': { hy: 'Մուտք գործել որպես %@', ru: 'Войти как %@', en: 'Sign in as %@' },
  'auth.tapAvatarPhone': { hy: 'Հպեք ավատարին՝ մուտք գործելու համար', ru: 'Коснитесь аватара, чтобы войти', en: 'Tap your avatar to sign in' },
  /* Шесть, а не четыре. Код доступа в продукте шестизначный (см.
     lib/pin.ts), и каталог приложения это уже говорил — а здесь осталось
     старое число с тех пор, когда код был короче. Пока никто не запускал
     генератор, расхождение не было видно; первый же запуск подписал бы
     поле «4 цифры» под шестизначным вводом. */
  'auth.pinField': { hy: 'Մուտքի կոդ · 6 նիշ', ru: 'Код доступа · 6 цифр', en: 'Access code · 6 digits' },
  /* Подсказка сотруднику. Называет ОБА поля разом: он смотрит на «код
     доступа» и вспоминает SMS, а код ему выдали вместе с номером. */
  'auth.staffNote': {
    hy: 'Հեռախոսահամարը և մուտքի կոդը տալիս է բիզնեսի սեփականատերը։',
    ru: 'Номер телефона и код доступа выдаёт владелец бизнеса.',
    en: 'The business owner gives you your phone number and access code.',
  },
  'auth.rememberedExpiredPin': {
    hy: 'Պահված մուտքի ժամկետն ավարտվել է։ Մուտքագրեք մուտքի կոդը։',
    ru: 'Срок сохранённого входа истёк. Введите код доступа.',
    en: 'The saved sign-in has expired. Enter your access code.',
  },
  'auth.pinShort': { hy: 'Մուտքի կոդ · 4 նիշ', ru: 'Код доступа · 4 цифры', en: 'Access code · 4 digits' },
  'auth.pinMismatch': { hy: 'Կոդերը չեն համընկնում', ru: 'Коды не совпадают', en: 'The codes do not match' },
  'auth.pinWrong': { hy: 'Մուտքի կոդը սխալ է', ru: 'Код доступа неверный', en: 'The access code is wrong' },
  'auth.throttled': { hy: 'Չափազանց շատ փորձեր։ Սպասեք։', ru: 'Слишком много попыток. Подождите.', en: 'Too many attempts. Wait.' },

  /* --- проверка входа с незнакомого устройства ---

     Эти девять строк жили только в собранном каталоге и в этот файл не
     попали. Пока генератор не запускали, всё работало; первый же запуск
     вычистил бы их, и экран проверки показал бы человеку собственные
     ключи вместо слов. Возвращены сюда, чтобы каталог снова собирался из
     одного места. --- */
  'auth.stepUpTitle': { hy: 'Ստուգում', ru: 'Проверка', en: 'Verification' },
  'auth.stepUpSub': {
    hy: 'Մուտքն անծանոթ սարքից է։ Կոդն ուղարկվել է %@',
    ru: 'Вход с незнакомого устройства. Код отправлен на %@',
    en: 'Sign-in from an unfamiliar device. The code was sent to %@',
  },
  'auth.otpCode': { hy: 'Կոդը SMS-ից', ru: 'Код из SMS', en: 'Code from SMS' },
  'auth.otpVerify': { hy: 'Հաստատել', ru: 'Подтвердить', en: 'Confirm' },
  'auth.otpResend': { hy: 'Ուղարկել կրկին', ru: 'Отправить снова', en: 'Send again' },
  'auth.otpInvalid': { hy: 'Կոդը սխալ է', ru: 'Код неверный', en: 'That code is wrong' },
  'auth.otpExpired': {
    hy: 'Կոդի ժամկետն անցել է։ Խնդրեք նորը։',
    ru: 'Срок кода истёк. Запросите новый.',
    en: 'The code expired. Ask for a new one.',
  },
  'auth.otpTooMany': {
    hy: 'Չափազանց շատ փորձեր։ Խնդրեք նոր կոդ։',
    ru: 'Слишком много попыток. Запросите новый код.',
    en: 'Too many attempts. Ask for a new code.',
  },
  'auth.smsFailed': {
    hy: 'Չհաջողվեց ուղարկել SMS։ Փորձեք քիչ անց։',
    ru: 'Не удалось отправить SMS. Попробуйте позже.',
    en: 'Could not send the SMS. Try again shortly.',
  },

  /* --- «Ещё»: карта бизнеса --- */
  'more.title': { hy: 'Ավելին', ru: 'Ещё', en: 'More' },
  'more.lead': { hy: 'Ձեր բիզնեսի քարտեզը', ru: 'Карта вашего бизнеса', en: 'The map of your business' },
  'more.points': { hy: 'Մասնաճյուղեր', ru: 'Филиалы', en: 'Locations' },
  /* Та же причина, что у `order.knownClient`: два числа — значит без
     склонения, иначе «2 филиалов». */
  'more.pointsSomeClosed': {
    hy: '%1$lld մասնաճյուղ · %2$lld սպասում է վճարման',
    ru: 'Филиалов: %1$lld · ждут оплаты: %2$lld',
    en: 'Locations: %1$lld · awaiting payment: %2$lld',
  },
  'more.clientsLead': { hy: 'Այցեր ու մեքենաների պատմություն', ru: 'Визиты и история машин', en: 'Visits and car history' },
  'more.team': { hy: 'Թիմ', ru: 'Команда', en: 'Team' },
  'more.teamLead': { hy: 'աշխատակիցներ և տոկոսներ', ru: 'сотрудники и проценты', en: 'staff and percentages' },
  'more.profileLead': { hy: 'Պրոֆիլ և մուտք', ru: 'Профиль и вход', en: 'Profile and access' },
  'more.export': { hy: 'Արտահանել տվյալները', ru: 'Выгрузить данные', en: 'Export the data' },
  'more.exportLead': { hy: 'վերջին 30 օրը', ru: 'последние 30 дней', en: 'the last 30 days' },

  /* --- филиалы --- */
  'points.addOnWeb': {
    hy: 'Նոր մասնաճյուղն ավելացվում է կայքում՝ tetrin.pro',
    ru: 'Новый филиал добавляется на сайте tetrin.pro',
    en: 'A new location is added on tetrin.pro',
  },
  'points.switchFailed': {
    hy: 'Չստացվեց անցնել։ Ստուգեք կապը և կրկնեք։',
    ru: 'Не удалось перейти. Проверьте связь и повторите.',
    en: "Couldn't switch. Check the connection and try again.",
  },
  'points.open': { hy: 'Անցնել', ru: 'Перейти', en: 'Open' },
  'points.awaitingPayment': { hy: 'Սպասում է վճարման', ru: 'Ждёт оплаты', en: 'Awaiting payment' },
  'points.working': { hy: 'Աշխատում է', ru: 'Работает', en: 'Working' },
  'points.closed': { hy: 'Փակ է', ru: 'Закрыт', en: 'Closed' },
  'points.rowAwaiting': { hy: '%@ · սպասում է վճարման', ru: '%@ · ждёт оплаты', en: '%@ · awaiting payment' },

  /* --- срок вышел --- */
  'expired.worker': {
    hy: 'Այս մասնաճյուղում գրանցումները ժամանակավորապես փակ են։ Դիմեք սեփականատիրոջը։',
    ru: 'В этом филиале записи временно закрыты. Обратитесь к владельцу.',
    en: 'Records are temporarily closed at this location. Talk to the owner.',
  },
  'expired.fresh': {
    hy: 'Սկսում ենք վճարումից հետո։ Ձեր մյուս մասնաճյուղերն աշխատում են ինչպես առաջ։',
    ru: 'Начинаем после оплаты. Остальные ваши филиалы работают как прежде.',
    en: 'It starts after payment. Your other locations work as before.',
  },
  'expired.blocked': {
    hy: 'Մուտքը ժամանակավորապես դադարեցված է։ Ձեր տվյալները տեղում են՝ գրանցումները, հասույթը, հաճախորդների բազան։ Ոչինչ չի կորել։',
    ru: 'Доступ временно приостановлен. Ваши данные на месте: записи, выручка, база клиентов. Ничего не потеряно.',
    en: 'Access is temporarily suspended. Your data is where it was: records, revenue, the client base. Nothing is lost.',
  },
  'expired.blockedTitle': { hy: 'Մուտքը փակ է', ru: 'Доступ закрыт', en: 'Access is closed' },

  /* --- прайс --- */
  'services.empty': { hy: 'Գնացուցակը դատարկ է', ru: 'Прайс пуст', en: 'The price list is empty' },
  'services.priceNote': {
    hy: 'Գնի փոփոխությունը չի ազդում արդեն կատարված գրանցումների վրա։',
    ru: 'Изменение цены не влияет на уже сделанные записи.',
    en: 'A price change does not affect records already made.',
  },
  'services.header': { hy: 'ԳՆԱՑՈՒՑԱԿ', ru: 'ПРАЙС', en: 'PRICE LIST' },
  'services.avgPrice': { hy: 'միջին գին', ru: 'средняя цена', en: 'average price' },
  'services.addTiers': { hy: 'Ավելացնել դասեր', ru: 'Добавить классы', en: 'Add classes' },
  'services.tiersExample': { hy: 'օրինակ՝ սեդան, կրոսովեր, ջիպ', ru: 'например: седан, кроссовер, джип', en: 'for example: sedan, crossover, SUV' },
  'services.tiersNote': { hy: 'ամեն դասի՝ իր գինը', ru: 'у каждого класса своя цена', en: 'each class gets its own price' },
  'services.nameField': { hy: 'Ի՞նչ ծառայություն', ru: 'Какая услуга', en: 'Which service' },
  'services.namePlaceholder': { hy: 'Կոմպլեքս', ru: 'Комплекс', en: 'Full wash' },
  'services.priceByTier': { hy: 'Գինը՝ ըստ մեքենայի դասի', ru: 'Цена по классу машины', en: 'Price by car class' },
  'services.removeTitle': { hy: 'Հեռացնե՞լ գնացուցակից', ru: 'Убрать из прайса?', en: 'Remove from the price list?' },
  'services.removeNote': {
    hy: 'Գրանցումների պատմությունը մնում է տեղում։',
    ru: 'История записей остаётся на месте.',
    en: 'The record history stays where it is.',
  },
  'services.remove': { hy: 'Հեռացնել գնացուցակից', ru: 'Убрать из прайса', en: 'Remove from the price list' },
  'services.tierNameField': { hy: 'Ինչպես կոչվի', ru: 'Как назовём', en: 'What to call it' },
  'services.tierPlaceholder': { hy: 'Սեդան', ru: 'Седан', en: 'Sedan' },
  'services.addTier': { hy: 'Ավելացնել դաս', ru: 'Добавить класс', en: 'Add a class' },
  'services.noTiersNote': {
    hy: 'Առանց դասերի ամեն ծառայություն ունի մեկ գին։',
    ru: 'Без классов у каждой услуги одна цена.',
    en: 'Without classes every service has one price.',
  },
  'services.tiers': { hy: 'Դասեր', ru: 'Классы', en: 'Classes' },

  /* --- люди --- */
  'staff.onShift': { hy: 'հերթափոխին', ru: 'на смене', en: 'on shift' },
  'staff.due': { hy: 'վճարելու է %@', ru: 'к выплате %@', en: 'due %@' },
  'staff.perRecord': { hy: 'գրանցումից', ru: 'с записи', en: 'per record' },
  'staff.add': { hy: 'Ավելացնել %@', ru: 'Добавить: %@', en: 'Add %@' },
  'staff.newTitle': { hy: 'Նոր %@', ru: 'Новый: %@', en: 'New %@' },
  'staff.namePlaceholder': { hy: 'Դավիթ', ru: 'Давид', en: 'David' },
  'staff.percentField': { hy: 'Տոկոս գրանցումից', ru: 'Процент с записи', en: 'Percentage per record' },
  'staff.deactivateTitle': { hy: 'Անջատե՞լ աշխատակցին', ru: 'Отключить сотрудника?', en: 'Deactivate this person?' },
  'staff.deactivate': { hy: 'Անջատել', ru: 'Отключить', en: 'Deactivate' },
  'staff.deactivateAction': { hy: 'Անջատել աշխատակցին', ru: 'Отключить сотрудника', en: 'Deactivate the person' },
  'staff.deactivateNote': {
    hy: 'Մուտքը փակվում է անմիջապես։ Պատմությունը մնում է։',
    ru: 'Вход закрывается сразу. История остаётся.',
    en: 'Access closes immediately. The history stays.',
  },
  'staff.percentNote': {
    hy: 'Փոփոխությունը գործում է նոր գրանցումների համար։ Հները չեն վերահաշվարկվում։',
    ru: 'Изменение действует для новых записей. Старые не пересчитываются.',
    en: 'The change applies to new records. Old ones are not recalculated.',
  },

  /* --- зарплаты --- */
  'payroll.dueHeader': { hy: 'ՎՃԱՐԵԼՈՒ Է', ru: 'К ВЫПЛАТЕ', en: 'DUE' },
  'payroll.allPaidMark': { hy: 'Վճարելու է ✓', ru: 'К выплате ✓', en: 'Due ✓' },
  'payroll.notOnServer': {
    hy: 'Աշխատավարձերի ցուցակը սերվերում դեռ չկա։',
    ru: 'Списка зарплат на сервере ещё нет.',
    en: 'The payroll list is not on the server yet.',
  },
  'payroll.todayDay': { hy: 'Այսօր · %@', ru: 'Сегодня · %@', en: 'Today · %@' },
  'payroll.forWorkRange': {
    hy: '%1$@ — %2$@ աշխատանքի համար',
    ru: 'за работу %1$@ — %2$@',
    en: 'for work %1$@ — %2$@',
  },
  'payroll.feedTotal': { hy: 'Ընդամենը · %@', ru: 'Всего · %@', en: 'Total · %@' },

  /* --- расходы --- */
  'expenses.newTitle': { hy: 'Նոր ծախս', ru: 'Новый расход', en: 'New expense' },
  'expenses.one': { hy: 'Ծախս', ru: 'Расход', en: 'Expense' },
  'expenses.categoryPlaceholder': { hy: 'վարձ, ջուր, քիմիա', ru: 'аренда, вода, химия', en: 'rent, water, chemicals' },
  'expenses.shareOfRevenue': { hy: 'հասույթի %@%%', ru: '%@%% выручки', en: '%@%% of revenue' },
  'expenses.monthlySpent': { hy: 'Ամսական %@', ru: 'Ежемесячные %@', en: 'Monthly %@' },
  'expenses.oneOffSpent': { hy: 'Միանգամյա %@', ru: 'Разовые %@', en: 'One-off %@' },
  'expenses.perDay': { hy: 'օրական %@', ru: 'в день %@', en: 'per day %@' },
  'expenses.stoppedOn': { hy: 'դադարեցվել է %@', ru: 'остановлен %@', en: 'stopped %@' },
  'expenses.accruedSum': { hy: 'հաշվարկված %@', ru: 'начислено %@', en: 'accrued %@' },
  'expenses.changeNote': {
    hy: 'Հին գումարը մնում է անցած օրերին։ Նորը գործում է այսօրվանից։',
    ru: 'Прежняя сумма остаётся у прошедших дней. Новая действует с сегодняшнего дня.',
    en: 'The old amount stays with past days. The new one applies from today.',
  },

  /* --- удаление бизнеса --- */
  'delete.what': {
    hy: 'Ջնջվում է ամեն ինչ՝ գրանցումները, հաճախորդները, ծառայությունները և բոլոր աշխատակիցները։',
    ru: 'Удаляется всё: записи, клиенты, услуги и все сотрудники.',
    en: 'Everything goes: records, clients, services and all staff.',
  },
  'delete.staffNote': {
    hy: 'Աշխատակիցների մուտքը փակվում է անմիջապես։',
    ru: 'Вход для сотрудников закрывается сразу.',
    en: 'Staff access closes immediately.',
  },
  'delete.downloaded': { hy: 'Տվյալները ներբեռնված են։', ru: 'Данные скачаны.', en: 'The data is downloaded.' },
  'delete.fileNote': {
    hy: 'Ֆայլը կպահվի ձեր հեռախոսում՝ Excel-ի համար։',
    ru: 'Файл сохранится в телефоне, для Excel.',
    en: 'The file is saved on your phone, for Excel.',
  },
  'delete.downloadFailed': { hy: 'Չհաջողվեց ներբեռնել տվյալները։', ru: 'Не удалось скачать данные.', en: "Couldn't download the data." },
  'delete.saveFailed': { hy: 'Չհաջողվեց պահպանել ֆայլը։', ru: 'Не удалось сохранить файл.', en: "Couldn't save the file." },

  /* --- профиль --- */
  'profile.pushEveryCar': { hy: 'Ծանուցում ամեն մեքենայի մասին', ru: 'Уведомление о каждой машине', en: 'A notification for every car' },
  'profile.pushShiftNote': {
    hy: 'Հերթափոխի բացման մասին ծանուցումը գալիս է միշտ',
    ru: 'Уведомление об открытии смены приходит всегда',
    en: 'The shift-opened notification always arrives',
  },
  'profile.rememberNote': {
    hy: 'Դուրս գալուց հետո վերադարձեք ավատարով և սարքի հաստատմամբ',
    ru: 'После выхода вернётесь по аватару и подтверждению устройства',
    en: 'After signing out you return via your avatar and device confirmation',
  },
  'profile.lockNote': {
    hy: 'Հավելվածը կփակվի ամեն անգամ, երբ դուրս գաք դրանից',
    ru: 'Приложение будет закрываться каждый раз, когда вы из него выходите',
    en: 'The app locks every time you leave it',
  },
  'profile.pinNote': {
    hy: 'Թույլ է տալիս մտնել առանց SMS-ի։ Այս կոդն օգտագործվում է նաև հաշիվ արագ մտնելու համար։',
    ru: 'Позволяет входить без SMS. Этот код также используется для быстрого входа в аккаунт.',
    en: 'Lets you sign in without SMS. This code is also used for quick access to your account.',
  },
  'profile.deleteNote': {
    hy: 'Բոլոր տվյալները և աշխատակիցները ջնջվում են ընդմիշտ',
    ru: 'Все данные и сотрудники удаляются навсегда',
    en: 'All data and staff are deleted for good',
  },
  'profile.available': { hy: 'Հասանելի է', ru: 'Доступно', en: 'Available' },
  'profile.availableUntil': { hy: 'Հասանելի է մինչև %@', ru: 'Доступно до %@', en: 'Available until %@' },
  'profile.pinChangedNote': {
    hy: 'Մյուս հեռախոսներից ելքը կփակվի։ Այս հեռախոսը կմնա բացված։',
    ru: 'Другие телефоны выйдут. Этот телефон останется в аккаунте.',
    en: 'Other phones sign out. This phone stays signed in.',
  },

  /* --- запись машины --- */
  /* Два числа в одной строке. Форму слова по числу здесь взять негде —
     варианты каталога умеют считать только по ОДНОМУ числу, — поэтому
     русский и английский построены так, что склонять нечего:
     «Визитов: 2», а не «был 2 раз». */
  'order.knownClient': {
    hy: 'Արդեն եղել է %1$lld անգամ · ընդամենը %2$@',
    ru: 'Визитов: %1$lld · всего %2$@',
    en: 'Visits: %1$lld · %2$@ in total',
  },
  'order.newUnit': { hy: 'Նոր %@', ru: 'Новая запись: %@', en: 'New %@' },
  'order.addUnit': { hy: 'Ավելացնել %@', ru: 'Добавить %@', en: 'Add %@' },
  'order.closeCamera': { hy: 'Փակել տեսախցիկը', ru: 'Закрыть камеру', en: 'Close the camera' },
  'order.openCamera': { hy: 'Բացել տեսախցիկը', ru: 'Открыть камеру', en: 'Open the camera' },
  'order.discounted': { hy: 'Զեղչով', ru: 'Со скидкой', en: 'Discounted' },
  'order.giveDiscount': { hy: 'Զեղչ տալ', ru: 'Дать скидку', en: 'Give a discount' },
  'order.saving': { hy: 'Գրանցվում է…', ru: 'Записывается…', en: 'Logging…' },

  /* --- сканер номера --- */
  'scanner.unavailable': { hy: 'Տեսախցիկը հասանելի չէ', ru: 'Камера недоступна', en: 'The camera is unavailable' },
  'scanner.close': { hy: 'Փակել տեսախցիկը', ru: 'Закрыть камеру', en: 'Close the camera' },
  'scanner.manual': { hy: 'Ձեռքով', ru: 'Вручную', en: 'By hand' },
  'scanner.accept': { hy: 'Ընդունել', ru: 'Принять', en: 'Accept' },

  /* --- клиенты --- */
  'clients.worthCalling': { hy: 'Արժե զանգել', ru: 'Стоит позвонить', en: 'Worth a call' },
  'clients.visitsLastToday': { hy: '%@ · վերջինը՝ այսօր', ru: '%@ · последний сегодня', en: '%@ · last today' },
  'clients.visitsLastAgo': { hy: '%1$@ · վերջինը՝ %2$@', ru: '%1$@ · последний %2$@', en: '%1$@ · last %2$@' },
  'clients.summaryLine': {
    hy: '%1$@ · միջինը %2$@ · վերջինը՝ %3$@',
    ru: '%1$@ · в среднем %2$@ · последний %3$@',
    en: '%1$@ · %2$@ average · last %3$@',
  },

  /* --- онбординг владельца --- */
  'onboarding.s1Title': { hy: 'Ամեն մեքենան՝ գրանցված', ru: 'Каждая машина записана', en: 'Every car logged' },
  'onboarding.s1Body': {
    hy: 'Լվացողը գրանցում է երեք հպումով՝ համարանիշ, ծառայություն, վճարում։ Դուք տեսնում եք նույն վայրկյանին։',
    ru: 'Мойщик записывает в три касания: номер, услуга, оплата. Вы видите в ту же секунду.',
    en: 'The washer logs it in three taps: plate, service, payment. You see it the same second.',
  },
  'onboarding.s2Title': { hy: 'Աշխատավարձը հաշվվում է ինքնաշխատ', ru: 'Зарплата считается сама', en: 'Payroll adds itself up' },
  'onboarding.s2Body': {
    hy: 'Ամեն մեքենայից՝ լվացողի տոկոսը։ Տոկոսը պահվում է գրանցման պահին, ուստի գների փոփոխությունը անցյալը չի փոխում։',
    ru: 'С каждой машины идёт процент мойщика. Процент запоминается в момент записи, поэтому изменение цен прошлое не меняет.',
    en: "The washer's percentage from every car. The percentage is stored at the moment of logging, so price changes do not rewrite the past.",
  },
  'onboarding.s3Title': { hy: 'Երևում է, թե որքան է մնում', ru: 'Видно, сколько остаётся', en: 'You see what is left' },
  'onboarding.s3Body': {
    hy: 'Հասույթից հանվում են աշխատավարձը և ծախսերը՝ վարձ, քիմիա, հոսանք։ Մնացածը ձեր շահույթն է։',
    ru: 'Из выручки вычитаются зарплата и расходы: аренда, химия, электричество. Остальное ваша прибыль.',
    en: 'Payroll and expenses come off the revenue: rent, chemicals, electricity. The rest is your profit.',
  },
  'onboarding.s4Title': { hy: 'Տվյալները ձերն են', ru: 'Данные ваши', en: 'The data is yours' },
  'onboarding.s4Body': {
    hy: 'Ներբեռնեք ամեն ինչ Excel-ով ցանկացած պահի։ Կապը կտրվե՞ց, գրանցումները սպասում են հեռախոսում և ուղարկվում իրենք։',
    ru: 'Скачайте всё в Excel в любой момент. Пропала связь, записи ждут в телефоне и уходят сами.',
    en: 'Download everything to Excel at any moment. Lost connection, records wait on the phone and send themselves.',
  },

  /* --- виджет и живая активность --- */
  'widget.revenue': { hy: 'հասույթ', ru: 'выручка', en: 'revenue' },
  'widget.records': { hy: 'գրանցում', ru: 'записей', en: 'records' },
  'widget.cash': { hy: 'Կանխիկ %@', ru: 'Наличные %@', en: 'Cash %@' },

  'services.priceTitle': { hy: 'Գինը', ru: 'Цена', en: 'Price' },
  'services.removeNoteShort': {
    hy: 'Գրանցումների պատմությունը մնում է տեղում',
    ru: 'История записей остаётся на месте',
    en: 'The record history stays where it is',
  },
  'expenses.hint1': { hy: 'Քիմիա', ru: 'Химия', en: 'Chemicals' },
  'expenses.hint2': { hy: 'Վարձ', ru: 'Аренда', en: 'Rent' },
  'expenses.hint3': { hy: 'Հոսանք', ru: 'Электричество', en: 'Electricity' },
  'expenses.hint4': { hy: 'Ջուր', ru: 'Вода', en: 'Water' },
  'expenses.hint5': { hy: 'Գույք', ru: 'Инвентарь', en: 'Equipment' },
  'expenses.hint6': { hy: 'Վերանորոգում', ru: 'Ремонт', en: 'Repairs' },
  'payroll.alreadyPaid': { hy: 'արդեն՝ %@', ru: 'уже %@', en: 'already %@' },
  'payroll.forWork': { hy: '%@ աշխատանքի համար', ru: 'за работу %@', en: 'for work on %@' },
  'payroll.forWorkUpTo': { hy: 'մինչև %@ աշխատանքի համար', ru: 'за работу по %@', en: 'for work up to %@' },
  'payroll.paySum': { hy: 'Վճարել %@', ru: 'Выплатить %@', en: 'Pay %@' },
  'payroll.done': { hy: 'Վճարումը նշված է՝ %@', ru: 'Выплата отмечена · %@', en: 'Payout recorded · %@' },

  /* Функции веб-словаря: значением там не строка, а сборка строки, и
     вытащить её общим обходом нельзя — форма записана здесь. */
  'work.since': { hy: '%@-ից', ru: 'с %@', en: 'since %@' },
  /* --- совместная работа: пример с числами ---

     В веб-словаре это функция, а функции в строковый каталог не
     переносятся: там формат, а не код. Слова те же, что на сайте, —
     расходиться им нельзя, за этим следит общий глоссарий выше. */
  'crew.example': {
    hy: '%1$@ · %2$lld%% · %3$@ → %4$@ յուրաքանչյուրին',
    ru: '%1$@ · %2$lld%% · %3$@ → по %4$@ каждому',
    en: '%1$@ · %2$lld%% · %3$@ → %4$@ each',
  },

  'work.addFor': { hy: 'Ավելացնել %1$@ · %2$@', ru: 'Добавить %1$@ · %2$@', en: 'Add %1$@ · %2$@' },

  /* --- язык --- */
  'common.language': { hy: 'Լեզու', ru: 'Язык', en: 'Language' },
};

/* ------------------------------------------------------------------ *
 * Строки со счётом                                                     *
 * ------------------------------------------------------------------ */

/**
 * Формы слова по числу.
 *
 * Отдельно от обычных строк, потому что в каталоге они лежат иначе — не
 * одной строкой, а вариантами: три формы у русского («1 визит», «2
 * визита», «5 визитов»), две у английского, одна у армянского. После
 * числительного армянский всегда ставит единственное — «5 այց», а не
 * «5 այցեր», — и это правильный армянский, а не недоделанный перевод.
 *
 * Считать формы руками в Swift нельзя: правило выбора у каждого языка
 * своё, и написанный однажды `if count == 1` ломается на первом же
 * четвёртом визите по-русски.
 */
type Plural = { one: string; few?: string; many?: string; other: string };

export const PLURALS: Record<string, { hy: Plural; ru: Plural; en: Plural }> = {
  'clients.visitsCount': {
    hy: { one: '%lld այց', other: '%lld այց' },
    ru: { one: '%lld визит', few: '%lld визита', many: '%lld визитов', other: '%lld визита' },
    en: { one: '%lld visit', other: '%lld visits' },
  },
  'clients.daysAgo': {
    hy: { one: '%lld օր առաջ', other: '%lld օր առաջ' },
    ru: { one: '%lld день назад', few: '%lld дня назад', many: '%lld дней назад', other: '%lld дня назад' },
    en: { one: '%lld day ago', other: '%lld days ago' },
  },
  'shift.waitingToSend': {
    hy: { one: '%lld գրանցում սպասում է կապի', other: '%lld գրանցում սպասում է կապի' },
    ru: {
      one: '%lld запись ждёт связи',
      few: '%lld записи ждут связи',
      many: '%lld записей ждут связи',
      other: '%lld записи ждут связи',
    },
    en: { one: '%lld record waiting for a connection', other: '%lld records waiting for a connection' },
  },
  'services.count': {
    hy: { one: '%lld դիրք', other: '%lld դիրք' },
    ru: { one: '%lld позиция', few: '%lld позиции', many: '%lld позиций', other: '%lld позиции' },
    en: { one: '%lld item', other: '%lld items' },
  },
  'services.tiersApplyNote': {
    hy: {
      one: 'Ամեն ծառայության մոտ կհայտնվի %lld գին։ Հին գրանցումները չեն փոխվում։',
      other: 'Ամեն ծառայության մոտ կհայտնվի %lld գին։ Հին գրանցումները չեն փոխվում։',
    },
    ru: {
      one: 'У каждой услуги появится %lld цена. Старые записи не меняются.',
      few: 'У каждой услуги появится %lld цены. Старые записи не меняются.',
      many: 'У каждой услуги появится %lld цен. Старые записи не меняются.',
      other: 'У каждой услуги появится %lld цены. Старые записи не меняются.',
    },
    en: {
      one: 'Every service gets %lld price. Old records do not change.',
      other: 'Every service gets %lld prices. Old records do not change.',
    },
  },
  'more.pointsAllOpen': {
    hy: { one: '%lld մասնաճյուղ · բոլորը բաց են', other: '%lld մասնաճյուղ · բոլորը բաց են' },
    ru: {
      one: '%lld филиал · все открыты',
      few: '%lld филиала · все открыты',
      many: '%lld филиалов · все открыты',
      other: '%lld филиала · все открыты',
    },
    en: { one: '%lld location · all open', other: '%lld locations · all open' },
  },
  'points.paidDays': {
    hy: { one: 'Վճարված է · %lld օր', other: 'Վճարված է · %lld օր' },
    ru: { one: 'Оплачено · %lld день', few: 'Оплачено · %lld дня', many: 'Оплачено · %lld дней', other: 'Оплачено · %lld дня' },
    en: { one: 'Paid · %lld day', other: 'Paid · %lld days' },
  },
  'points.trialDays': {
    hy: { one: 'Փորձնական · %lld օր', other: 'Փորձնական · %lld օր' },
    ru: { one: 'Пробный · %lld день', few: 'Пробный · %lld дня', many: 'Пробный · %lld дней', other: 'Пробный · %lld дня' },
    en: { one: 'Trial · %lld day', other: 'Trial · %lld days' },
  },
  'payroll.showPaidDays': {
    hy: { one: 'Ցույց տալ վճարված օրերը (%lld)', other: 'Ցույց տալ վճարված օրերը (%lld)' },
    ru: { one: 'Показать выплаченные дни (%lld)', few: 'Показать выплаченные дни (%lld)', many: 'Показать выплаченные дни (%lld)', other: 'Показать выплаченные дни (%lld)' },
    en: { one: 'Show paid days (%lld)', other: 'Show paid days (%lld)' },
  },
  'auth.tooManyTries': {
    hy: { one: 'Չափազանց շատ փորձեր։ Կրկնեք %lld րոպեից։', other: 'Չափազանց շատ փորձեր։ Կրկնեք %lld րոպեից։' },
    ru: {
      one: 'Слишком много попыток. Повторите через %lld минуту.',
      few: 'Слишком много попыток. Повторите через %lld минуты.',
      many: 'Слишком много попыток. Повторите через %lld минут.',
      other: 'Слишком много попыток. Повторите через %lld минуты.',
    },
    en: { one: 'Too many attempts. Try again in %lld minute.', other: 'Too many attempts. Try again in %lld minutes.' },
  },
  'payroll.selected': {
    hy: { one: 'Ընտրված է %lld', other: 'Ընտրված է %lld' },
    ru: { one: 'Выбран %lld', few: 'Выбрано %lld', many: 'Выбрано %lld', other: 'Выбрано %lld' },
    en: { one: '%lld selected', other: '%lld selected' },
  },
};

/* ------------------------------------------------------------------ *
 * Что взять из общего словаря продукта                                *
 * ------------------------------------------------------------------ */

/**
 * Ключи `lib/i18n`, которые нужны приложению.
 *
 * Список явный, а не «весь словарь»: витрина, страницы согласия и
 * админка в приложение не едут, и тащить их в каталог значило бы
 * заставлять переводчика гадать, что из этого вообще видно на телефоне.
 */
export const SHARED_KEYS: string[] = [
  'common.edit', 'common.close', 'common.back', 'common.cancel',
  'common.save', 'common.delete', 'common.today', 'common.yesterday',
  'common.total', 'common.empty', 'common.no', 'common.retry',
  'auth.signInTitle', 'auth.phone', 'auth.pin', 'auth.signIn',
  'auth.signOut', 'auth.welcomeBack', 'auth.anotherAccount', 'auth.wrongCredentials',
  'auth.phoneTaken', 'auth.changePin', 'auth.currentPin', 'auth.newPin',
  'auth.wrongPin',
  /* Вход ролями. Слова «владелец» и «сотрудник» берём из общих `roles.*`:
     они уже стоят в карточке человека, и второй пары синонимов на том же
     экране быть не должно. */
  'auth.ownerTitle', 'auth.staffTitle', 'auth.staffHelper', 'auth.ownerCodeHelper',
  'auth.deleteAccessCode', 'auth.deleteAccessCodeNote', 'auth.deleteAccessCodeAsk',
  'auth.deleteAccessCodeDone', 'auth.staffAccessCode', 'auth.staffAccessCodeNote',
  'profile.rememberLogin', 'billing.expiredTitle', 'billing.blockedTitle',
  'billing.wallDownload', 'billing.wallDelete', 'roles.owner', 'roles.staff',
  'points.title', 'points.here', 'points.freshTitle', 'work.earnedToday',
  'work.shiftRevenue', 'work.worksTotal', 'work.onShift', 'work.needShift',
  'work.endTitle', 'work.endStay', 'work.signOutOpenTitle', 'work.emptyOpen',
  'work.emptyOpenNote', 'work.emptyOff', 'work.emptyOffNote', 'work.tier',
  'work.toPay', 'work.saved', 'work.revokeTitle', 'work.revokeKeep',
  'crew.title', 'crew.lead', 'crew.percentLabel', 'crew.percentHint',
  'crew.off', 'crew.offNote', 'crew.who', 'crew.onlyMe',
  'crew.together', 'crew.alone', 'crew.nobodyOnShift', 'crew.pool',
  'crew.each',
  'crew.yours', 'crew.teamPercent', 'crew.joint', 'crew.author',
  'crew.needPercent', 'crew.edit', 'crew.editLead', 'errors.generic',
  'work.revoke', 'payroll.tabHistory', 'payroll.unpaid', 'payroll.paid',
  'payroll.selectAll', 'payroll.confirmTitle', 'payroll.confirm', 'payroll.failed',
  'payroll.dayToPay', 'payroll.dayAllPaid', 'payroll.dayEmpty', 'payroll.hidePaidDays',
  'payroll.historyEmpty', 'payroll.nothingUnpaid', 'payroll.openHistory', 'payment.cash',
  'payment.card', 'payment.transfer', 'payment.pass', 'today.working',
  'today.paidWith', 'today.noPayments', 'today.work', 'today.noRecords',
  'expenses.title', 'expenses.addExpense', 'expenses.category', 'expenses.date',
  'expenses.monthly', 'expenses.oneOff', 'expenses.perMonth', 'expenses.monthlyStartNote',
  'expenses.monthlyOnes', 'expenses.oneOffs', 'expenses.empty', 'expenses.remove',
  'expenses.removeTitle', 'expenses.removeMonthlyNote', 'expenses.removeOneOffNote', 'expenses.note',
  'expenses.kindOneNote', 'expenses.kindMonthlyNote', 'owner.tabClients', 'owner.revenue',
  'owner.payrollAccrued', 'owner.avgCheck', 'owner.onShift', 'owner.feed',
  'owner.clientsTotal', 'owner.clientsLoyal', 'owner.clientsFresh', 'owner.clientsLost',
  'owner.allClients', 'owner.lastVisitToday', 'owner.toPay', 'owner.clientsSearch',
  'owner.clientsNotFound', 'owner.clientFirstVisit', 'owner.clientOftenTakes', 'owner.clientOftenPays',
  'owner.clientOftenServed', 'owner.sortOften', 'owner.sortRichest', 'owner.clientLoyal',
  'owner.clientContacts', 'owner.clientName', 'owner.clientCall', 'owner.clientWrite',
  'owner.clientLostHint', 'owner.clientNoPhone', 'owner.periodMonth', 'owner.periodPrevMonth',
  'owner.periodLabel', 'owner.vsPrevPeriod', 'owner.colService', 'owner.lastVisit',
  'alerts.title', 'alerts.empty', 'alerts.emptyNote', 'alerts.later',
  'settings.services', 'settings.tabServices', 'settings.staff', 'settings.business',
  'settings.saved', 'settings.newService', 'settings.deleteNoWayBack', 'settings.deletePin',
  'settings.deleteKeep', 'settings.deleteWipe',
];

/* ------------------------------------------------------------------ *
 * Генератор каталога                                                   *
 * ------------------------------------------------------------------ */

function at(dict: unknown, key: string): string | null {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof node === 'string' ? node : null;
}

type Entry = { kind: 'plain'; row: Row } | { kind: 'plural'; forms: { hy: Plural; ru: Plural; en: Plural } };

export function buildCatalog(): { rows: Record<string, Entry>; missing: string[] } {
  const rows: Record<string, Entry> = {};
  const missing: string[] = [];

  for (const key of SHARED_KEYS) {
    const a = at(hy, key);
    const r = at(ru, key);
    const e = at(en, key);
    if (a === null || r === null || e === null) {
      missing.push(key);
      continue;
    }
    rows[key] = { kind: 'plain', row: { hy: a, ru: r, en: e } };
  }

  for (const [key, row] of Object.entries(IOS_ONLY)) {
    /* Ключ, объявленный дважды, — это молча потерянный перевод: одна из
       двух строк никогда не попадёт на экран, и заметить это можно
       только глазами. Пусть падает сборка каталога. */
    if (rows[key]) throw new Error(`Ключ ${key} уже пришёл из веб-словаря`);
    rows[key] = { kind: 'plain', row };
  }
  for (const [key, forms] of Object.entries(PLURALS)) {
    if (rows[key]) throw new Error(`Ключ ${key} уже объявлен без форм по числу`);
    rows[key] = { kind: 'plural', forms };
  }

  return { rows, missing };
}

function unit(value: string) {
  return { stringUnit: { state: 'translated', value } };
}

/** Варианты по количеству — так их держит строковый каталог Xcode. */
function pluralUnit(p: Plural) {
  const cases: Record<string, unknown> = { one: unit(p.one), other: unit(p.other) };
  if (p.few) cases.few = unit(p.few);
  if (p.many) cases.many = unit(p.many);
  return { variations: { plural: cases } };
}

/** Строковый каталог в формате Xcode 15+ (`.xcstrings`, версия 1.0). */
function toXcstrings(rows: Record<string, Entry>): string {
  const strings: Record<string, unknown> = {};
  for (const key of Object.keys(rows).sort()) {
    const e = rows[key];
    strings[key] = {
      extractionState: 'manual',
      localizations:
        e.kind === 'plain'
          ? {
              hy: unit(e.row.hy),
              ru: unit(e.row.ru),
              en: unit(e.row.en),
            }
          : {
              hy: pluralUnit(e.forms.hy),
              ru: pluralUnit(e.forms.ru),
              en: pluralUnit(e.forms.en),
            },
    };
  }
  return JSON.stringify({ sourceLanguage: 'hy', strings, version: '1.0' }, null, 2) + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('ios-strings.ts')) {
  const { rows, missing } = buildCatalog();
  if (missing.length) {
    console.error('Нет в веб-словаре:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  const out = path.join('ios', 'Tetr', 'Localizable.xcstrings');
  fs.writeFileSync(out, toXcstrings(rows));
  console.log(`${out}: ${Object.keys(rows).length} ключей × 3 языка`);
}
