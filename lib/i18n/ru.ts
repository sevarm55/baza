import type { Dict } from './hy';
import { BRAND } from '../brand';

/**
 * Русский интерфейс Tetrin.
 *
 * Не перевод армянского, а тот же продукт, сказанный по-русски. Правила
 * те же, что были у армянского оригинала, и они важнее буквальности:
 *
 *  — «Вам остаётся» вместо «прибыли»: два похожих слова с разными
 *    числами на одном экране путают даже автора продукта;
 *  — на кнопке стоит сумма, а не «подтвердить»: деньги отдают из рук в
 *    руки, и число обязано быть перед глазами до нажатия;
 *  — рабочий день и день выплаты никогда не называются одинаково;
 *  — кнопка короткая, пустое место — фразой.
 *
 * Единый словарь терминов (он же держит согласованность с английским):
 *
 *   հերթափոխ    → смена            → shift
 *   լվացող      → мойщик           → washer     (слово ниши, живёт в БД)
 *   աշխատակից   → сотрудник        → staff
 *   գրանցում    → запись           → record
 *   հասույթ     → выручка          → revenue
 *   ձեզ մնում է → вам остаётся     → you keep
 *   ծախս        → расход           → expense
 *   աշխատավարձ  → зарплата         → payroll
 *   ծառայություն→ услуга           → service
 *   աբոնեմենտ   → абонемент        → pass
 *   մասնաճյուղ  → филиал           → location
 *   հաճախորդ    → клиент           → client
 */

/**
 * Русские формы после числительного.
 *
 * Три формы, а не две: «1 машина», «2 машины», «5 машин». Отдельного
 * помощника на весь проект нет намеренно — правило языка живёт в файле
 * этого языка, а не в общем коде, где его пришлось бы включать флагом.
 */
function pl(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const ru: Dict = {
  locale: 'ru',
  localeName: 'Русский',

  app: {
    name: BRAND,
    tagline: 'Учёт, который уже настроен под ваш бизнес',
  },

  common: {
    edit: 'Изменить',
    collapse: 'Свернуть панель',
    close: 'Закрыть',
    expand: 'Развернуть панель',
    next: 'Дальше',
    back: 'Назад',
    cancel: 'Отмена',
    save: 'Сохранить',
    delete: 'Удалить',
    done: 'Готово',
    loading: 'Загрузка…',
    today: 'Сегодня',
    yesterday: 'Вчера',
    week: 'Неделя',
    month: 'Месяц',
    total: 'Всего',
    empty: 'Данных пока нет',
    error: 'Ошибка',
    yes: 'Да',
    no: 'Нет',
    search: 'Поиск',
    clear: 'Очистить',
    noResults: 'Ничего не нашлось',
    retry: 'Повторить',
    language: 'Язык',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    themeDarkLong: 'Тёмная тема',
    themeLightLong: 'Светлая тема',
  },

  meta: {
    landingTitle: 'Tetrin | Автомойка под вашим контролем',
    landingDescription:
      'Машины, сотрудники, зарплата и чистый результат — в одной простой системе.',
    privacyTitle: 'Политика конфиденциальности · Tetrin',
    privacyDescription: 'Какие данные хранит Tetrin и зачем',
    supportTitle: 'Поддержка · Tetrin',
    supportDescription: 'Помощь с приложением Tetrin',
  },

  push: {
    shiftTitle: 'Смена',
    shiftOpened: (name: string) => `${name} вышел на смену`,
    shiftClosedTitle: 'Смена закрыта',
    cashExpected: (sum: string) => `наличные ${sum}`,
    cashDeclared: (sum: string) => `сдал ${sum}`,
    cashNotDeclared: 'не указал',
    someone: 'Сотрудник',
  },

  csv: {
    date: 'Дата',
    time: 'Время',
    service: 'Услуга',
    price: 'Цена',
    payment: 'Оплата',
    percent: 'Процент',
  },

  landing: {
    eyebrow: 'Для автомоек',
    headline: 'Каждая машина — записана.',
    headlineAccent: 'Каждый драм — на месте.',
    lead: 'Мойщик записывает сам, потому что там же видит свой заработок.',
    ctaPrimary: (days: number) =>
      `Попробовать ${days} ${pl(days, 'день', 'дня', 'дней')} бесплатно`,
    ctaNote: 'Без карты. За три минуты.',

    steps: [
      {
        title: 'Три касания — и машина записана',
        body: 'Номер, услуга, оплата.',
        caption: 'Экран мойщика',
        alt: 'Мокрая рука мойщика на двери вымытой машины',
      },
      {
        title: 'Кто сколько машин вымыл',
        body: 'У каждой записи есть имя.',
        caption: 'Ход дня',
        alt: 'Двое мойщиков у двух разных машин',
      },
      {
        title: 'Зарплата считается сама',
        body: 'Ни калькулятора, ни споров.',
        caption: 'Зарплаты',
        alt: 'Наличные, передаваемые из рук в руки',
      },
      {
        title: 'Вам остаётся',
        body: 'Выручка минус зарплаты и расходы. Каждый день.',
        caption: 'Экран владельца',
        alt: 'Капли воды на белом кузове вымытой машины',
      },
    ],

    heroAlt: 'Вымытая машина в светлом боксе автомойки',
    priceAlt: 'Чистая машина выезжает с мойки',

    galleryEyebrow: 'Одним взглядом',

    priceTitle: 'Цена',
    pricePeriod: 'в месяц за один филиал',
    priceNote: (days: number) =>
      `Первые ${days} ${pl(days, 'день', 'дня', 'дней')} — бесплатно. Карта не нужна.`,
    footer: 'Tetrin — учёт для сервисного бизнеса',
  },

  errors: {
    required: 'Заполните все поля',
    badPhone: 'Неверный номер телефона',
    badPin: 'PIN должен быть из 6 цифр',
    badPercent: 'Процент должен быть от 0 до 100',
    generic: 'Что-то пошло не так',
  },

  auth: {
    signInTitle: 'Вход',
    note: 'Без карты. За три минуты.',
    phone: 'Телефон',
    pin: 'PIN-код',
    signIn: 'Войти',
    signOut: 'Выйти',
    welcomeBack: 'С возвращением',
    tapAvatar: 'Нажмите на аватар, чтобы войти',
    anotherAccount: 'Войти с другим номером',
    rememberedExpired: 'Срок сохранённого входа истёк. Введите телефон и PIN.',
    wrongCredentials: 'Неверный телефон или PIN',
    phoneTaken: 'Этот номер уже зарегистрирован',

    pinHint: '6 цифр',
    tooManyTries: (minutes: number) =>
      `Слишком много попыток. Повторите через ${minutes} ${pl(minutes, 'минуту', 'минуты', 'минут')}.`,

    changePin: 'Сменить PIN',
    currentPin: 'Текущий PIN',
    newPin: 'Новый PIN',
    wrongPin: 'Текущий PIN неверный',
    pinChangedNote: 'После смены выйдут все устройства, включая это.',
    welcome: 'С возвращением',
    welcomeSub: 'Войдите, чтобы продолжить работу',
    createTitle: 'Создайте автомойку',
    createSub: 'Настройка займёт меньше минуты',
    signingIn: 'Входим…',
    sending: 'Отправляем…',
    checking: 'Проверяем…',
    forgotPin: 'Забыли PIN?',
    createPin: 'Создайте PIN',
    pinMemo: 'Используйте 6 цифр, которые сможете запомнить',

    otpTitle: 'Подтвердите номер',
    otpSent: (phone: string) => `Мы отправили код на ${phone}`,
    otpCode: 'Код из SMS',
    otpVerify: 'Подтвердить',
    otpResend: 'Отправить код повторно',
    otpResendIn: (mmss: string) => `Отправить повторно через ${mmss}`,
    otpResendsLeft: (n: number) => `Осталось попыток: ${n}`,

    stepUpTitle: 'Дополнительная проверка',
    stepUpSub: (phone: string) => `Вход с незнакомого устройства. Мы отправили код на ${phone}`,

    resetTitle: 'Восстановление PIN',
    resetSub: 'Введите номер — пришлём код подтверждения',
    resetSend: 'Отправить код',
    resetSave: 'Сохранить новый PIN',
    resetDone: 'PIN изменён',
    resetDoneNote: 'Все другие устройства вышли.',
    backToSignIn: 'Вернуться ко входу',

    pinGroup: (n: number) => `PIN-код, ${n} цифр`,
    otpGroup: (n: number) => `Код подтверждения, ${n} цифр`,
    showCode: 'Показать код',
    hideCode: 'Скрыть код',
    entered: (n: number, total: number) => `Введено ${n} из ${total}`,
    country: 'Код страны',

    otpInvalid: 'Код неверный',
    otpExpired: 'Срок кода истёк. Запросите новый.',
    otpTooMany: 'Слишком много попыток. Запросите новый код.',
    otpResendTooSoon: 'Немного подождите перед новым кодом',
    smsFailed: 'Не удалось отправить SMS. Попробуйте позже.',
    pinTrivial: 'Выберите менее очевидный PIN',

    verifyPhone: 'Подтвердите свой номер',
    verifyPhoneNote: 'Без подтверждённого номера восстановить PIN нельзя. Займёт полминуты.',
    verifyNow: 'Подтвердить',
    verified: 'Номер подтверждён',
    entryTitle: 'Вход в Tetrin',
    entrySub: 'Введите номер — пришлём код',
    entrySend: 'Продолжить',
    entryPinDoor: 'Войти по PIN',
    entrySmsDoor: 'Войти по коду из SMS',
    nameTitle: 'Как называется ваша автомойка?',
    nameSub: 'Последний шаг — и сразу к работе',
    nameCreate: 'Создать и начать',
    setPin: 'Задать PIN',
    setPinNote: 'Вторая дверь — на случай, когда SMS не идёт. Необязательно.',
    setPinDone: 'PIN задан',
  },

  onboarding: {
    chooseNiche: 'Выберите тип бизнеса',
    chooseNicheSub: 'Получите готовую систему, а не пустой конструктор',
    bizName: 'Название бизнеса',
    ownerName: 'Ваше имя',
    createAccount: 'Создать',
    ready: 'Готово. Можно начинать работать.',

    newBusiness: 'Новый бизнес',
    inThreeMinutes: 'За три минуты',
    whatYouGet: 'Что вы получаете',
    servicesReady: (count: number) =>
      `${count} ${pl(count, 'услуга', 'услуги', 'услуг')} с ценами — уже заполнены`,
    editLater: 'Цены и услуги потом поправите сами',
    createAndStart: 'Создать и начать',
    freeDays: (days: number) =>
      `${days} ${pl(days, 'день', 'дня', 'дней')} бесплатно. Карта не нужна.`,
    alreadyHave: 'Уже есть аккаунт?',
  },

  profile: {
    title: 'Моя страница',
    access: 'Подписка',
    session: 'Это устройство',
    rememberLogin: 'Запомнить этот аккаунт',
    rememberLoginNote: 'После выхода вернётесь одним нажатием на аватар.',
    signOutNote: 'Выключите, если этим компьютером пользуется кто-то ещё.',
  },

  billing: {
    trialLeft: (days: number) =>
      `Пробного срока осталось ${days} ${pl(days, 'день', 'дня', 'дней')}`,
    paidLeft: (days: number) =>
      `Подписки осталось ${days} ${pl(days, 'день', 'дня', 'дней')}`,
    expiredTitle: 'Срок истёк',
    expiredWorker: 'Новые записи закрыты. Обратитесь к владельцу.',
    expiredOwner:
      'Ваши данные на месте — выручка, зарплаты, база клиентов, — и вы можете их скачать. Чтобы возобновить записи, продлите подписку.',
    renew: 'Свяжитесь с нами, чтобы продлить',
    blockedTitle: 'Доступ закрыт',
    blockedText:
      'Ваши данные сохранены и никуда не делись. Чтобы восстановить доступ, свяжитесь с нами.',

    wallTitle: 'Срок истёк',
    wallLead:
      'Ваши данные на месте: записи, выручка, база клиентов. Ничего не потеряно.',
    wallContinue: 'Чтобы продолжить, позвоните',
    wallPhone: '+374 99 855 546',
    wallDownload: 'Скачать данные',
    wallDelete: 'Удалить бизнес',
    wallDeleteNote: 'После удаления восстановить нельзя.',
  },

  roles: {
    owner: 'Владелец',
    staff: 'Сотрудник',
  },

  points: {
    title: 'Мои филиалы',
    needsPayment: 'ждёт оплаты',
    go: 'перейти',
    here: 'вы здесь',
    add: 'Добавить филиал',
    noTrial: 'Пробный срок даётся один раз. Новый филиал заработает после оплаты.',
    price: (sum: string) => `${sum} в месяц за каждый.`,
    freshTitle: 'Филиал создан',
    freshText:
      'Начинаем после оплаты. Остальные ваши филиалы работают как прежде — перейдите в любой из них.',
  },

  work: {
    earnedToday: 'Твой заработок сегодня',
    shiftRevenue: 'Выручка смены',

    worksTotal: 'Сумма работ',
    yourShare: (percent: number) => `твоя доля — ${percent}%`,

    onShift: 'Я на смене',
    shiftNotStarted: 'Смена ещё не начата',
    shiftDone: 'Смена завершена',
    since: (time: string) => `с ${time}`,
    lasted: (hours: number, minutes: number) =>
      hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`,
    range: (from: string, to: string) => `${from} — ${to}`,

    startShift: 'Начать смену',
    endShift: 'Завершить смену',
    needShift: 'Чтобы записывать, начните смену',

    endTitle: 'Завершить смену?',
    endConfirm: 'Завершить',
    endStay: 'Остаться на смене',
    endNote: (unit: string) =>
      `После завершения записать ${unit} можно будет только на новой смене.`,

    signOutOpenTitle: 'Смена открыта',
    signOutOpenNote:
      'Выход не закрывает смену. Она останется открытой и закроется сама вечером.',

    recent: 'Сегодня',
    emptyOpen: 'Смена начата',
    emptyOpenNote: 'Первая запись появится здесь.',
    emptyOff: 'Смена ещё не начата',
    emptyOffNote: 'Начните смену, чтобы записывать работу.',

    tier: 'Класс',
    stepService: 'Услуга',
    stepPayment: 'Оплата',
    toPay: 'Сумма к оплате',
    addFor: (unit: string, sum: string) => `Добавить ${unit} · ${sum}`,
    saved: 'Записано',
    addFailed: 'Не удалось записать. Попробуйте ещё раз.',

    revokeTitle: 'Отменить эту запись?',
    revokeNote: 'После отмены сегодняшний заработок пересчитается.',
    revokeKeep: 'Оставить',
    revoke: 'Отменить запись',
    rowActions: 'Действия',

    pending: 'Ждёт связи',
    waitingToSend: (count: number) =>
      `${count} ${pl(count, 'запись сохранена', 'записи сохранены', 'записей сохранено')} в телефоне и уйдёт, как только появится связь`,
    knownClient: (visits: number, ago: string, total: string) =>
      `Уже был ${visits} ${pl(visits, 'раз', 'раза', 'раз')} · последний ${ago} · всего ${total}`,
  },

  payroll: {
    tabDue: 'К выплате',
    tabHistory: 'История',
    lead: 'Расчёты и выплаты сотрудникам',

    unpaid: 'Не выплачено',
    paid: 'Выплачено',
    paidOn: (day: string, time: string) => `Выплачено ${day}, ${time}`,
    alreadyPaid: (sum: string) => `уже — ${sum}`,

    pay: 'Выплатить',
    paySum: (sum: string) => `Выплатить ${sum}`,
    selected: (count: number) => `Выбрано ${count}`,
    selectAll: 'Выбрать всех',

    confirmTitle: 'Подтвердить выплату',
    confirmNote: 'После подтверждения эти расчёты будут отмечены выплаченными.',
    confirm: 'Подтвердить',
    done: (sum: string) => `Выплата отмечена — ${sum}`,
    failed: 'Не удалось. Попробуйте ещё раз.',

    dayToPay: 'к выплате',
    dayAllPaid: 'Всё выплачено',
    dayEmpty: 'Сегодня расчётов пока нет',
    showPaidDays: (count: number) => `Показать выплаченные дни (${count})`,
    hidePaidDays: 'Скрыть выплаченные дни',

    details: 'Из чего сложилось',

    forWork: (day: string) => `за работу ${day}`,
    forWorkUpTo: (day: string) => `за работу по ${day}`,
    historyEmpty: 'Выплат ещё не было',

    nothingUnpaid: 'Невыплаченных расчётов сейчас нет.',
    openHistory: 'Посмотреть историю',
    loadFailed: 'Не удалось загрузить зарплаты',
    retry: 'Повторить',
  },

  payment: {
    cash: 'Наличные',
    card: 'Карта',
    transfer: 'Перевод',
    pass: 'Абонемент',
  },

  today: {
    since: (time: string) => `с ${time}`,
    nobodyOnShift: 'Сейчас на смене никого нет',

    working: 'Сегодня работают',

    paidWith: 'Чем платили',
    noPayments: 'Оплат пока нет',

    flowDay: 'Ход дня',
    flowPeriod: 'Ход',
    accumulated: 'Накоплено',
    inHour: 'В час',
    inDay: 'В день',
    peak: 'Больше всего',
    nowMark: 'сейчас',
    flowFailed: 'Не удалось загрузить ход дня',
    loadFailed: 'Не удалось загрузить сводку',

    work: 'Сегодняшняя работа',
    workAll: (day: string) => `Все записи за ${day}`,
    lastRecords: (count: number) =>
      `${pl(count, 'Последняя', 'Последние', 'Последние')} ${count} ${pl(count, 'запись', 'записи', 'записей')}`,
    all: 'Все',
    toBusiness: 'Бизнесу',
    clientPaid: 'Клиент заплатил',

    emptyNote: 'После первой записи показатели дня обновятся сами.',
    noRecords: 'Записей нет',
  },

  passes: {
    title: 'Абонементы',
    sell: 'Продать абонемент',
    uses: 'Количество',
    price: 'Цена',
    validDays: 'Срок, дней',
    unlimited: 'бессрочно',
    remaining: 'осталось',
    sold: 'Продано',
    used: 'Использовано',
    revenue: 'С абонементов',
    of: 'из',
    until: 'до',
    note:
      'Деньги приходят в момент продажи. Каждое использование выручки не создаёт — чтобы не считать одни и те же деньги дважды. Но мойщик машину вымыл и свой процент получает.',
    empty: 'Абонементов пока нет',
  },

  legal: {
    privacy: 'Политика конфиденциальности',
    support: 'Поддержка',
  },

  expenses: {
    title: 'Расходы',
    lead: 'Все расходы бизнеса за выбранный месяц',
    add: 'Добавить',
    addExpense: 'Добавить расход',
    amount: 'Сумма',
    category: 'На что',
    kind: 'Вид расхода',
    detailKind: 'Вид',
    date: 'Дата',
    monthly: 'Ежемесячный',
    oneOff: 'Разовый',
    perMonth: 'в месяц',
    perDay: 'в день',
    perDayAvg: 'В среднем за день',
    accrued: 'начислено',
    records: (n: number) => pl(n, 'запись', 'записи', 'записей'),
    biggest: 'самый большой',
    shareOfRevenue: (percent: string) => `${percent}% выручки`,
    activeSince: 'Действует',
    until: (day: string) => `до ${day}`,
    monthlyStartNote:
      'Ежемесячный расход действует с сегодняшнего дня и дальше начисляется сам.',
    pastMonth: 'Прошлый месяц не меняется.',
    closedNote: 'Этот расход больше не действует. Начисленное за прошедшие дни остаётся.',
    outOf: (sum: string) => `из ${sum}`,
    monthlyOnes: 'Ежемесячные расходы',
    monthlyAccrued: 'Начислено с ежемесячных',
    periodAccrued: 'за выбранный период',
    oneOffs: 'Разовые расходы',
    empty: 'Расходов пока нет',
    emptyNote:
      'Добавьте аренду, электричество, химию и остальные траты — чтобы видеть настоящую прибыль бизнеса.',
    remove: 'Убрать',
    removeTitle: 'Убрать расход?',
    removeMonthlyNote: 'С сегодняшнего дня он больше не начисляется. Расходы прошлых дней останутся.',
    removeOneOffNote: 'Этот расход будет удалён из учёта.',
    note: 'Ежемесячные расходы (аренда, электричество) распределяются на все дни месяца. Разовые остаются в своём дне.',
    changeNote: 'При смене месячной суммы прежняя остаётся у прошедших дней. Новая действует с сегодняшнего дня.',
    kindOneNote: 'остаётся в сегодняшнем дне',
    kindMonthlyNote: 'распределяется на все дни месяца',
    common: 'Частое',
    hints: ['Химия', 'Аренда', 'Электричество', 'Вода', 'Инвентарь', 'Ремонт'],
  },

  owner: {
    tabToday: 'Сегодня',
    tabPayroll: 'Зарплаты',
    tabClients: 'Клиенты',
    tabSettings: 'Настройки',
    revenue: 'Выручка',
    revenueToday: 'Выручка за сегодня',
    revenueMonth: 'Выручка за этот месяц',
    revenuePrevMonth: 'Выручка за прошлый месяц',
    profit: 'Вам остаётся',
    payrollAccrued: 'Зарплата',
    avgCheck: 'Средний чек',
    cashShare: 'Наличными',
    onShift: 'На смене',
    onShiftNow: 'Сейчас на смене',
    offShiftNow: 'Не на смене',
    feed: 'Поток',
    earned: 'ему',
    payrollDue: 'К выплате',
    rate: 'ставка',
    clientsTotal: 'В базе',
    clientsLoyal: 'Постоянные',
    clientsFresh: 'Новые',
    clientsLost: 'Давно не были',
    clientsLifetime: 'Всего принесли',
    clientsLead: 'История клиентов и повторные визиты',
    allClients: 'Все',
    visits: 'визиты',
    visitsCount: (n: number) => `${n} ${pl(n, 'визит', 'визита', 'визитов')}`,
    lostFor: (days: number) => `нет ${days} ${pl(days, 'день', 'дня', 'дней')}`,
    lastVisitToday: 'сегодня',
    lastVisitAgo: (days: number) =>
      `${days} ${pl(days, 'день', 'дня', 'дней')} назад`,
    daysShort: 'дн.',
    toPay: 'К выплате',
    clientsSearch: 'Номер, имя или телефон',
    clientsNotFound: 'Такого номера нет',
    clientsEmpty: 'Клиенты появляются сами',
    clientsEmptyNote:
      'После первой мойки машина попадает в базу — с визитами, потраченной суммой и историей.',
    clientHabits: 'Привычки',
    clientFirstVisit: 'Первый визит',
    clientOftenTakes: 'Часто берёт',
    clientOftenPays: 'Обычно платит',
    clientOftenServed: 'Обычно обслуживает',
    sortRecent: 'Последний визит',
    sortOften: 'Самые частые',
    sortRichest: 'Больше всех заплатили',
    lastVisitPrefix: 'последний —',
    clientHistory: 'История визитов',
    clientAvg: 'в среднем',
    clientLoyal: 'постоянный',
    clientOne: 'клиент',
    clientsCount: (n: number) => `${n} ${pl(n, 'клиент', 'клиента', 'клиентов')}`,
    clientContacts: 'Связь',
    clientName: 'Имя',
    clientPhone: 'Телефон',
    clientCall: 'Позвонить',
    clientWrite: 'Написать',
    clientLostHint: 'Давно не был — позвоните или предложите скидку',
    clientNoPhone: 'Телефон не записан',
    payoutHistory: 'История выплат',
    cancelOrder: 'Отменить',
    confirmCancel: 'Отменить эту запись?',
    periodToday: 'Сегодня',
    periodMonth: 'Этот месяц',
    periodPrevMonth: 'Прошлый месяц',
    periodLabel: 'Период',

    vsPrev: 'к предыдущему',
    kept: 'осталось',
    perUnit: 'с одной',
    costs: 'Расходы',
    payroll: 'зарплата',
    vsLastWeek: 'Неделю назад в это же время',
    vsPrevPeriod: 'Прошлый месяц',
    inTheRed: 'Вы в минусе',
    noBase: 'Сравнивать не с чем',
    emptyToday: 'Сегодня записей пока нет',

    colService: 'Услуга',
    avgShort: 'в среднем',
    timesShort: 'раз',
    timesCount: (n: number) => `${n} ${pl(n, 'раз', 'раза', 'раз')}`,
    colPayment: 'Оплата',
    colPrice: 'Цена',
    colShare: 'Доля',
    colTime: 'Время',
    feedTotal: 'Всего',
    rowActions: 'Действия',
    copyKey: 'Копировать',
    copiedKey: 'Скопировано',
    openClient: 'Открыть клиента',
    clientsTotalSpent: 'Всего',
    lastVisit: 'Последний визит',
    profitBreakdown: 'Расчёт',
    clientsLostNote: (count: number) =>
      `${pl(count, 'Этот', 'Эти', 'Эти')} ${count} ${pl(count, 'клиент', 'клиента', 'клиентов')} — деньги, которые уже на столе. Вернуть старого клиента дешевле, чем привести нового.`,
  },

  reports: {
    title: 'Отчёт',
    note: 'Ход выручки, расходов и прибыли',
    trend: 'Ход по месяцам',
    byMonth: 'По месяцам',
    month: 'Месяц',
    whereGone: 'Куда ушло',
    whereFrom: 'Откуда пришло',
    emptyMonth: 'В этом месяце работы не было',
    toPayroll: 'Перейти к зарплатам',
  },

  alerts: {
    title: 'Внимание',
    empty: 'Всё в порядке',
    emptyNote: 'Делать нечего. Когда что-то потребует внимания, оно появится здесь.',
    later: 'Потом',
    lostTitle: (count: number) =>
      `${count} ${pl(count, 'клиент давно не был', 'клиента давно не были', 'клиентов давно не были')}`,
    lostNote: (days: number) =>
      `Больше ${days} ${pl(days, 'дня', 'дней', 'дней')}. Звонок дешевле, чем привести нового клиента.`,
    lostAction: 'Посмотреть и позвонить',
    payrollTitle: 'Пора выплатить зарплату',
    payrollNote: (days: number) =>
      `С последней выплаты прошло ${days} ${pl(days, 'день', 'дня', 'дней')}.`,
    payrollAction: 'Открыть зарплаты',
  },

  nav: {
    finance: 'ДЕНЬГИ',
    management: 'УПРАВЛЕНИЕ',
  },

  settings: {
    services: 'Услуги и цены',
    tabServices: 'Услуги',
    tabData: 'Данные',
    lead: 'Услуги, цены и настройки бизнеса',
    servicesEmpty: 'Услуг пока нет',
    servicesEmptyNote:
      'Добавьте то, что продаёте, с ценой. Мойщик при записи выбирает из списка, а цена уходит в запись.',
    exportNote:
      'В файле будут все записи за последние 30 дней — машина, услуга, цена, способ оплаты, мойщик и его доля. Открывается в Excel.',
    staff: 'Сотрудники',
    business: 'Бизнес',
    addService: 'Добавить услугу',
    addStaff: 'Добавить сотрудника',
    staffLead: 'Кто работает и какой даёт результат',
    staffEmpty: 'Сотрудников пока нет',
    staffEmptyNote:
      'Добавьте мойщика — он войдёт со своего телефона, будет записывать машины, а зарплата посчитается сама.',
    access: 'Доступ',
    role: 'Роль',
    pinHidden: 'Не показывается',
    staffNote:
      'Сотрудник входит со своего телефона и с PIN. Продиктуйте ему PIN — пароль запоминать не нужно.',
    price: 'Цена',
    percent: 'Процент',
    name: 'Имя',
    active: 'Активен',
    businessName: 'Название бизнеса',
    saved: 'Сохранено',
    exportEarned: 'Зарплата',
    exportCanceled: 'Отменено',
    export: 'Выгрузка данных',
    exportCsv: 'Скачать данные за 30 дней (Excel)',
    save: 'Сохранить',
    remove: 'Убрать',
    newService: 'Новая услуга',
    percentNote:
      'Изменение процента действует для новых записей. Уже начисленное и выплаченное не меняется.',
    priceNote:
      'Изменение цены не влияет на уже сделанные записи. Вчерашняя выручка и зарплата останутся прежними.',

    deleteTitle: 'Удалить бизнес',
    deleteWhat:
      'Удаляется всё — записи, клиенты, услуги и все сотрудники. Вход для сотрудников закроется сразу.',
    deleteNoWayBack: 'Восстановить нельзя.',
    deletePin: 'Подтвердите своим PIN',
    deleteKeep: 'Скачать данные и удалить',
    deleteWipe: 'Удалить без скачивания',
    deleteHint: 'Файл скачается для Excel, затем бизнес будет удалён.',
    deleteWrongPin: 'PIN неверный.',
    deleteThrottled: 'Слишком много попыток. Подождите и повторите.',
    deleteFailed: 'Не удалось. Попробуйте ещё раз.',
  },
};
