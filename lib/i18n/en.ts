import type { Dict } from './hy';
import { BRAND, SUPPORT_PHONE_HUMAN } from '../brand';

/**
 * English interface of Tetrin.
 *
 * Written as product copy, not as a translation. Same rules that shaped
 * the Armenian original hold here:
 *
 *  — "Net profit" everywhere: the owner picked one plain formula
 *    different numbers on one screen confuse even the author;
 *  — the button carries the amount, not the word "confirm": cash changes
 *    hands, and the number must be in sight before the tap, not after;
 *  — the day worked and the day paid are never named the same way;
 *  — buttons stay short, empty states speak in full sentences.
 *
 * Shared glossary (kept in step with ru.ts):
 *
 *   հերթափոխ    → смена            → shift
 *   լվացող      → мойщик           → washer     (niche word, lives in DB)
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

/** English has two forms, and that is the whole rule. */
function pl(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}

export const en: Dict = {
  locale: 'en',
  localeName: 'English',

  app: {
    name: BRAND,
    tagline: 'Bookkeeping already set up for your business',
  },

  common: {
    edit: 'Edit',
    collapse: 'Collapse panel',
    close: 'Close',
    expand: 'Expand panel',
    next: 'Next',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    done: 'Done',
    loading: 'Loading…',
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'Week',
    month: 'Month',
    total: 'Total',
    empty: 'No data yet',
    error: 'Error',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    clear: 'Clear',
    noResults: 'Nothing found',
    retry: 'Try again',
    saving: 'Saving…',
    saved: 'Saved',
    adding: 'Adding…',
    added: 'Added',
    deleting: 'Deleting…',
    updating: 'Updating…',
    retrying: 'Retrying…',
    refreshing: 'Refreshing',
    loadFailed: 'Could not load the data',
    stillWorking: 'Still working',
    offline: 'No internet connection',
    offlineNote: 'Check your connection and try again',
    language: 'Language',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeDarkLong: 'Dark theme',
    themeLightLong: 'Light theme',
    theme: 'Theme',
    /* Доля владельца в легенде полосы разреза: место там на одно слово. */
    you: 'you',
  },

  meta: {
    privacyTitle: 'Privacy policy · Tetrin',
    privacyDescription: 'What Tetrin stores and why',
    supportTitle: 'Support · Tetrin',
    supportDescription: 'Help with the Tetrin app',
  },

  push: {
    shiftTitle: 'Shift',
    shiftOpened: (name: string) => `${name} started a shift`,
    shiftClosedTitle: 'Shift closed',
    cashExpected: (sum: string) => `cash ${sum}`,
    cashDeclared: (sum: string) => `handed over ${sum}`,
    cashNotDeclared: 'not stated',
    someone: 'Staff member',
    orderInstead: (sum: string) => `instead of ${sum}`,
  },

  csv: {
    date: 'Date',
    time: 'Time',
    service: 'Service',
    price: 'Price',
    payment: 'Payment',
    percent: 'Percentage',
  },

  landing: {
    hero: {
      title: 'Your car wash, under control',
      cta: 'Try for free',
      note: (days: number) => `${days} days free · no card`,
    },
    how: {
      title: 'How Tetrin works',
      lead: 'One record travels the whole way by itself: from a plate number to a line in the report.',
      steps: [
        { title: 'Car', body: 'the plate in three taps' },
        { title: 'Service', body: 'from your own price list' },
        { title: 'Washer', body: 'who recorded it, or the whole crew' },
        { title: 'Payment', body: 'cash, card, transfer' },
        { title: 'Analytics', body: 'revenue, payroll, profit at once' },
      ],
    },
    live: {
      title: 'The owner sees it right now',
      lead: 'Washers record cars from their phone, the owner sees revenue, payroll and expenses right now.',
      demo: 'demo',
      revenue: 'Revenue',
      payroll: 'Payroll',
      services: ['Full', 'Body', 'Interior'],
    },
    problem: {
      title: 'What breaks without a system',
      items: [
        { title: 'Cars are written down by hand', body: 'A notebook or a chat: by the evening half of the records are lost and nobody remembers who washed the blue sedan.' },
        { title: 'Nobody knows who earned what', body: 'Percentages are counted in the head at the end of the shift, and every month starts with a payroll argument.' },
        { title: 'Expenses live separately', body: 'Chemicals, water, rent sit in receipts and in memory. Monthly profit stays a guess.' },
        { title: 'The owner cannot see the wash without calling', body: 'To know what is going on you have to come or call. Neither scales.' },
      ],
    },
    cabinet: {
      title: 'The whole business on one screen',
      lead: 'Profit, revenue, payroll and expenses for any period. Who is on shift and what was recorded a minute ago, in the same feed.',
    },

    app: {
      title: 'Tetrin is always with you',
      lead: 'An iPhone app for the owner and the washer: shift, today, payroll, calendar. The same data as in the browser.',
      appStore: 'Download on the App Store',
      android: 'Android coming soon',
    },

    price: {
      title: 'One price for everything',
      per: 'per month',
      point: 'per location',
      includes: [
        'No limits on cars or staff',
        'Web workspace and iPhone app',
        'Several locations in one workspace',
        'Updates at no extra cost',
      ],
      note: 'No card needed. The trial is given once, a second location is paid separately.',
    },
    closing: {
      title: 'Start with one car.',
      lead: 'Record the first car today and see the day’s result in the evening.',
      note: (days: number) => `${days} days free · no card`,
      callNote: 'Easier to ask? Call us',
      callHours: 'We answer every day, 10:00–20:00',
    },
    faq: {
      title: 'Questions owners ask',
      items: [
        { q: 'Do I need a computer at the wash?', a: 'No. Washers record cars from a phone, and the owner needs only a phone or any browser.' },
        { q: 'What if a washer forgets to record a car?', a: 'The owner sees every record in the feed at once and can add a missed car or cancel an extra one. A washer only sees earnings for recorded cars, so recording pays off for them.' },
        { q: 'How is payroll counted?', a: 'Every employee has their own percent, a shared wash has a team percent. The percent is stored at the moment of the record, so past days do not change when you change the rate.' },
        { q: 'Can I take my data with me?', a: 'Yes, any time: export all records to CSV from the workspace.' },
        { q: 'What happens after the trial?', a: 'The workspace switches to read-only until payment. Data is kept, nothing is deleted.' },
      ],
    },
    footer: 'car wash management',
    footerAria: 'Legal and support',
  },

  errors: {
    required: 'Fill in every field',
    badPhone: 'Invalid phone number',
    badPin: 'The PIN must be 6 digits',
    badPercent: 'Percentage must be between 0 and 100',
    generic: 'Something went wrong',
  },

  auth: {
    signInTitle: 'Sign in',
    note: 'No card. Three minutes.',
    phone: 'Phone number',
    /* Two secrets, two words. The PIN is permanent; the code is
       one-time and arrives by SMS. The word «code» is reserved for
       SMS and nothing else. The reasoning is in ru.ts, same spot. */
    pin: 'PIN',
    signIn: 'Sign in',
    signOut: 'Sign out',
    welcomeBack: 'Welcome back',
    tapAvatar: 'Tap your avatar to sign in',
    anotherAccount: 'Sign in with another number',
    rememberedExpired: 'The saved sign-in has expired. Enter your number and PIN.',
    wrongCredentials: 'Wrong number or PIN',
    phoneTaken: 'This number is already registered',

    pinHint: '6 digits',
    tooManyTries: (minutes: number) =>
      `Too many attempts. Try again in ${minutes} ${pl(minutes, 'minute', 'minutes')}.`,

    changePin: 'Change the PIN',
    currentPin: 'Current PIN',
    newPin: 'New PIN',
    confirmPin: 'Repeat the new PIN',
    pinMismatch: 'The PIN does not match',
    wrongPin: 'The current PIN is wrong',
    pinChangedNote: 'After the change every device signs out, including this one.',
    welcome: 'Welcome back',
    welcomeSub: 'Sign in to continue',
    createTitle: 'Create your car wash',
    createSub: 'Setup takes less than a minute',
    signingIn: 'Signing in…',
    signingOut: 'Signing out…',
    sending: 'Sending…',
    checking: 'Checking…',
    forgotPin: 'Forgot your PIN?',
    tempAccessTitle: 'Your PIN is temporary',
    tempAccessNote: (deadline: string) => `It stops working on ${deadline}. Set your own PIN.`,
    tempAccessAction: 'Set your own PIN',
    createPin: 'Create a PIN',
    pinMemo: 'Use 6 digits you will remember',

    otpTitle: 'Enter the code from SMS',
    otpSent: (phone: string) => `The code was sent to ${phone}`,
    otpCode: 'Code from SMS',
    otpVerify: 'Confirm',
    otpResend: 'Send the code again',
    otpResendIn: (mmss: string) => `Send again in ${mmss}`,
    otpResendsLeft: (n: number) => `${n} attempts left`,

    stepUpTitle: 'Extra check',
    stepUpSub: (phone: string) => `Sign-in from an unfamiliar device. The code was sent to ${phone}`,

    resetTitle: 'Reset your PIN',
    resetSub: 'Enter your number and we will send a code by SMS',
    resetSend: 'Get the code',
    resetSave: 'Save the PIN',
    resetDone: 'PIN changed',
    resetDoneNote: 'All other devices have been signed out.',
    backToSignIn: 'Back to sign in',

    pinGroup: (n: number) => `PIN, ${n} digits`,
    otpGroup: (n: number) => `Confirmation code, ${n} digits`,
    showCode: 'Show PIN',
    hideCode: 'Hide PIN',
    entered: (n: number, total: number) => `${n} of ${total} entered`,
    country: 'Country code',

    otpInvalid: 'That code is wrong',
    otpExpired: 'The code expired. Ask for a new one.',
    otpTooMany: 'Too many attempts. Ask for a new code.',
    otpResendTooSoon: 'Wait a moment before asking for a new code',
    smsFailed: 'Could not send the SMS. Try again shortly.',
    pinTrivial: 'Pick a less obvious PIN',

    changePhone: 'Change number',
    changePhoneNote: 'Your number is your sign-in. We will check it is you, then send a code to the new number.',
    changePhoneProof: 'First confirm it is you',
    changePhoneNew: 'New number',
    changePhoneDone: 'Number changed',
    changePhoneDoneNote: 'All sessions are closed. Sign in with the new number.',
    samePhone: 'This is your current number',
    verifyPhone: 'Confirm your number',
    verifyPhoneNote: 'Without a confirmed number your PIN cannot be recovered. Takes half a minute.',
    verifyNow: 'Confirm',
    verified: 'Number confirmed',
    entryTitle: 'Sign in',
    entrySub: 'Enter your number and we will send a code by SMS',
    entrySend: 'Get the code',
    entryPinDoor: 'Sign in with your PIN',
    entrySmsDoor: 'Sign in with an SMS code',
    nameTitle: 'What is your car wash called?',
    nameSub: 'Last step, then straight to work',
    nameCreate: 'Create and start',
    setPin: 'Create a PIN',
    setPinNote: 'Lets you sign in without SMS. Optional.',
    setPinDone: 'PIN created',

    /* ───────── who is signing in ───────── */
    ownerTitle: 'Owner sign-in',
    staffTitle: 'Staff sign-in',
    staffHelper: 'The business owner gives you your phone number and PIN.',
    ownerCodeHelper: 'You can create a PIN in your Tetrin profile.',
    accessCodeField: (n: number) => `PIN · ${n} digits`,

    /* ───────── the PIN in the profile ───────── */
    deleteAccessCode: 'Delete the PIN',
    deleteAccessCodeNote: 'Only the SMS code will remain. Every device signs out, including this one.',
    deleteAccessCodeAsk: 'Delete the PIN?',
    deleteAccessCodeDone: 'PIN deleted',
    staffAccessCode: 'Staff PIN',
    staffAccessCodeNote: 'The staff member signs in with their own phone number and this PIN.',
  },

  onboarding: {
    chooseNiche: 'Choose your type of business',
    chooseNicheSub: 'You get a working system, not an empty builder',
    bizName: 'Business name',
    ownerName: 'Your name',
    createAccount: 'Create',
    ready: 'Ready. You can start working.',

    newBusiness: 'New business',
    inThreeMinutes: 'In three minutes',
    whatYouGet: 'What you get',
    servicesReady: (count: number) =>
      `${count} ${pl(count, 'service', 'services')} with prices, already filled in`,
    editLater: "You'll adjust prices and services yourself later",
    createAndStart: 'Create and start',
    freeDays: (days: number) => `${days} ${pl(days, 'day', 'days')} free. No card needed.`,
    alreadyHave: 'Already have an account?',
  },

  setup: {
    workerTitle: 'Welcome',
    workerLead: 'Your shift lives here.',
    workerOne: 'Open the shift',
    workerTwo: 'Log the cars you serve',
    workerThree: 'Close the shift when you are done',
    workerNote: 'After every entry you see what you have earned at the top.',
    workerCta: 'Start working',
  },

  firstRun: {
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    progressAria: 'Setup progress',
    later: 'Set up later',

    nameServices: 'Services',
    nameExpense: 'Expense',
    nameStaff: 'Worker',
    namePreview: 'Worker view',
    nameCar: 'First car',

    s1Title: 'What do you offer your clients?',
    s1Note: 'We prefilled a starter price list. Adjust the prices, remove what you do not need or add your own. You can change everything later.',
    s1Service: 'Service',
    s1Add: 'Add a service',
    s1Remove: 'Remove',
    s1Suggest: 'Quick add',
    s1Cta: 'Save the price list',
    s1Done: 'Price list ready',
    s1Empty: 'Keep at least one service',

    s2Title: 'Add one expense',
    s2Note: 'This lets Tetrin show real costs and profit, not just revenue.',
    s2Done: 'Expense added',

    s3Title: 'Add your first worker',
    s3Note: 'A worker signs in with their phone number and PIN, opens a shift and records the cars they wash.',
    s3PercentNote: 'of every car',
    s3Done: 'Worker added',

    s4Title: 'See Tetrin through your worker\'s eyes',
    s4Note: 'You will see the worker\'s real screen: the shift and car recording. You can leave at any moment.',
    s4Again: 'Pick up where you left off: enter worker mode and record the first car.',
    s4Cta: 'Enter as the worker',

    barWatching: 'You are viewing Tetrin as your worker',
    barTaskShift: 'Start the shift',
    barTaskShiftNote: 'This is the button a worker starts the day with.',
    barTaskCar: 'Add the first car',
    barTaskCarNote: 'This is exactly how workers will record every job.',
    barDone: 'First car added',
    barExit: 'Return as the owner',
    barLeave: 'End the preview',

    fTitle: 'That is it, all done',
    fLead: (name: string) => `${name} added the first car`,
    fNote: 'From now on it works like this: workers record the cars, and you instantly see the work, the revenue and the payroll.',
    fCta: 'Start working',
  },

  profile: {
    title: 'My page',
    lead: 'Personal details, security and account settings',
    personal: 'Personal details',
    security: 'Security',
    interface: 'Interface',
    account: 'Account',
    phone: 'Phone',
    pinNote: 'Lets you sign in without SMS. This PIN is also used for quick access to your account.',
    access: 'Subscription',
    session: 'This device',
    devices: 'Devices',
    devicesNote: 'Where your sign-in is open right now. You can close the others.',
    deviceThis: 'This device',
    deviceRevoke: 'Close the sign-in',
    deviceLastSeen: (when: string) => `last seen ${when}`,
    deviceApp: 'App',
    deviceWeb: 'Browser',
    devicesOne: 'The sign-in is open only on this device.',
    notifyOrders: 'A notification for every car',
    notifyOrdersNote: 'The shift-opened notification always arrives',
    rememberLogin: 'Remember this account',
    rememberLoginNote: 'After signing out you come back with one tap on the avatar.',
    signOutNote: 'Turn this off if other people use this computer too.',
  },

  billing: {
    trialLeft: (days: number) => `${days} ${pl(days, 'day', 'days')} left of the trial`,
    paidLeft: (days: number) => `${days} ${pl(days, 'day', 'days')} left on the subscription`,
    expiredTitle: 'The term has ended',
    expiredWorker: 'New records are closed. Talk to the owner.',
    expiredOwner:
      'Your data is where it was: revenue, payroll, the client base. You can download all of it. To start logging again, renew the subscription.',
    renew: 'Get in touch to renew',
    blockedTitle: 'Access is closed',
    blockedText:
      'Your data is saved and nothing is lost. Get in touch to restore access.',

    wallTitle: 'The term has ended',
    wallLead: 'Your data is where it was: records, revenue, the client base. Nothing is lost.',
    wallContinue: 'To continue, call',
    wallPhone: SUPPORT_PHONE_HUMAN,
    wallDownload: 'Download the data',
    wallDelete: 'Delete the business',
    wallDeleteNote: 'Once deleted it cannot be restored.',
  },

  roles: {
    owner: 'Owner',
    staff: 'Staff',
  },

  points: {
    title: 'My locations',
    search: 'Find a location',
    manage: 'All locations',
    needsPayment: 'awaiting payment',
    go: 'open',
    here: "you're here",
    trialDays: (days: number) => `Trial · ${days} ${pl(days, 'day', 'days')}`,
    paidDays: (days: number) => `Paid · ${days} ${pl(days, 'day', 'days')}`,
    working: 'Working',
    closed: 'Closed',
    add: 'Add a location',
    noTrial: 'The trial is given once. A new location starts working after payment.',
    price: (sum: string) => `${sum} per month for each.`,
    freshTitle: 'Location created',
    freshText:
      'It starts after payment. Your other locations work as before, open any of them.',
  },

  work: {
    earnedToday: 'You earned today',
    shiftRevenue: 'Shift revenue',

    worksTotal: 'Work total',

    handOver: 'Handing over in cash',

    cashInShift: (sum: string) => `${sum} collected`,

    handOverDiff: (sum: string) => `Off by ${sum}. The owner will see it.`,

    toHandOver: 'to hand over',
    yourShare: (percent: number) => `your share ${percent}%`,

    onShift: "I'm on shift",
    /* Приветствие по времени суток на экране смены: единственное
       место, где продукт зовёт человека по имени. Ночью «доброй ночи»
       звучит прощанием, поэтому там нейтральное. */
    greetingMorning: 'Good morning',
    greetingDay: 'Good afternoon',
    greetingEvening: 'Good evening',
    greetingPlain: 'Hello',
    shiftNotStarted: 'Shift not started yet',
    shiftDone: 'Shift finished',
    since: (time: string) => `since ${time}`,
    lasted: (hours: number, minutes: number) =>
      hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`,
    /* Промежуток «от и до», а не связка: тире здесь на своём месте.
       Связки из словаря убраны, разделитель фактов — точка «·». */
    range: (from: string, to: string) => `${from} — ${to}`,

    startShift: 'Start shift',
    startingShift: 'Starting…',
    endShift: 'End shift',
    needShift: 'Start your shift to log work',

    endTitle: 'End the shift?',
    endConfirm: 'End',
    endingShift: 'Ending…',
    endStay: 'Stay on shift',
    endNote: (unit: string) =>
      `After it ends you can log ${unit} only on a new shift.`,

    signOutOpenTitle: 'The shift is open',
    signOutOpenNote:
      'Signing out does not close the shift. It stays open and closes itself in the evening.',

    recent: 'Today',
    emptyOpen: 'Shift started',
    emptyOpenNote: 'The first record will show up here.',
    emptyOff: 'Shift not started yet',
    emptyOffNote: 'Start the shift to log your work.',

    tier: 'Class',
    stepService: 'Service',
    stepPayment: 'Payment',
    toPay: 'Amount due',
    giveDiscount: 'Give a discount',
    discounted: 'Charged',
    addFor: (unit: string, sum: string) => `Add ${unit} · ${sum}`,
    /* Заголовок формы записи: «New car». Слово приходит в том падеже,
       которого требует язык, — считает `unitForms`. */
    newUnit: (unit: string) => `New ${unit}`,
    saved: 'Logged',
    recording: 'Logging…',
    loadFailed: 'Could not load the shift',
    addFailed: "Couldn't log it. Try again.",

    revokeTitle: 'Cancel this record?',
    revokeNote: "Today's earnings will be recalculated.",
    revokeKeep: 'Keep',
    revoke: 'Cancel record',
    rowActions: 'Actions',

    pending: 'Waiting for a connection',
    waitingToSend: (count: number) =>
      `${count} ${pl(count, 'record is', 'records are')} saved on the phone and will be sent as soon as there's a connection`,
    knownClient: (visits: number, ago: string, total: string) =>
      `Been here ${visits} ${pl(visits, 'time', 'times')} · last ${ago} · ${total} in total`,
  },

  crew: {
    title: 'Shared job',
    lead: 'When several people work on one car',

    percentLabel: 'Team percent',
    percentHint:
      'The percent is taken from the price and split equally between everyone involved. It is the percent for the whole team, not for each person.',
    example: (price: string, percent: number, people: string, each: string) =>
      `${price} · ${percent}% · ${people} → ${each} each`,

    off: 'Off',
    offNote:
      'Set the team percent and your staff will be able to mark a job as done together.',
    on: (percent: number) => `${percent}% for the whole team`,

    who: 'Who worked',
    onlyMe: 'Just me',
    together: 'Together with colleagues',
    alone: 'There is nobody else at this point',
    nobodyOnShift: 'None of your colleagues is on shift. Only people who started their shift can be picked.',

    pool: 'Team pay',
    each: 'Each',
    yours: 'You earn',
    teamPercent: 'Team percent',
    joint: 'Shared',

    needPercent: 'The team percent is not set.',

    author: 'Recorded by',
    edit: 'Change the crew',
    editLead: 'Who worked on this car',
  },

  payroll: {
    tabDue: 'Due',
    tabHistory: 'History',
    lead: 'Payroll calculations and payouts',

    unpaid: 'Unpaid',
    paid: 'Paid',
    paidOn: (day: string, time: string) => `Paid ${day}, ${time}`,
    alreadyPaid: (sum: string) => `already ${sum}`,

    pay: 'Pay',
    paySum: (sum: string) => `Pay ${sum}`,
    selected: (count: number) => `${count} selected`,
    selectAll: 'Select all',

    confirmTitle: 'Confirm the payout',
    confirmNote: 'Once confirmed, these calculations are marked as paid.',
    confirm: 'Confirm',
    paying: 'Recording payout…',
    done: (sum: string) => `Payout recorded · ${sum}`,
    failed: "Couldn't do it. Try again.",

    dayToPay: 'due',
    dayAllPaid: 'Everything is paid',
    dayEmpty: 'No calculations today yet',
    showPaidDays: (count: number) => `Show paid days (${count})`,
    hidePaidDays: 'Hide paid days',

    details: 'How it adds up',

    forWork: (day: string) => `for work on ${day}`,
    forWorkUpTo: (day: string) => `for work up to ${day}`,
    historyEmpty: 'No payouts yet',

    emptyNoStaff: 'This is where Tetrin counts what you owe your people',
    emptyNoStaffNote: 'Add a person and their percentage first.',
    emptyNoStaffCta: 'Go to people',
    emptyNoWork: 'Nothing to pay for yet',
    emptyNoWorkNote: 'The numbers appear after the first car is logged.',

    nothingUnpaid: 'Nothing is unpaid right now.',
    openHistory: 'See the history',
    loadFailed: "Couldn't load payroll",
    retry: 'Try again',
  },

  payment: {
    cash: 'Cash',
    card: 'Card',
    transfer: 'Transfer',
    pass: 'Pass',
  },

  today: {
    since: (time: string) => `since ${time}`,
    nobodyOnShift: 'Nobody is on shift right now',

    working: 'Working today',

    paidWith: 'How they paid',
    noPayments: 'No payments yet',

    flowDay: 'How the day went',
    flowPeriod: 'How it went',
    accumulated: 'Accumulated',
    inHour: 'Per hour',
    inDay: 'Per day',
    peak: 'Busiest',
    nowMark: 'now',
    flowFailed: "Couldn't load the flow",
    loadFailed: "Couldn't load the summary",

    work: "Today's work",
    workAll: (day: string) => `All records for ${day}`,
    lastRecords: (count: number) => `Last ${count} ${pl(count, 'record', 'records')}`,
    all: 'All',
    toBusiness: 'To the business',
    clientPaid: 'The client paid',

    emptyNote: "After the first record the day's figures update themselves.",
    noRecords: 'No records',

    attention: 'Attention',
    attentionDiscounts: (sum: string) => `Discounts ${sum}`,
    attentionCanceled: (n: number) => `Canceled ${n}`,
    attentionCash: (name: string, diff: string) => `${name}: cash mismatch ${diff}`,
    attentionCashNotDeclared: (name: string) => `${name}: cash not handed over`,
    attentionNobody: 'Nobody is on shift',
    nowWorking: 'Working now',
  },

  passes: {
    title: 'Passes',
    sell: 'Sell a pass',
    uses: 'Uses',
    price: 'Price',
    validDays: 'Valid, days',
    unlimited: 'no expiry',
    remaining: 'left',
    sold: 'Sold',
    used: 'Used',
    revenue: 'From passes',
    of: 'of',
    until: 'until',
    note:
      'The money arrives at the moment of sale. Each use creates no revenue, so the same money is not counted twice. But the washer did wash the car, and he gets his percentage.',
    empty: 'No passes yet',
  },

  legal: {
    privacy: 'Privacy policy',
    support: 'Support',
  },

  day: {

    shifts: 'Shifts',

    noShifts: 'No shifts that day',

    noShiftsNote: 'Nobody started a shift.',

    work: 'Work that day',

    noCash: 'No cash that day',

    notDeclared: 'did not state how much was handed over',

    cashMatches: 'matches',

    stillOpen: 'the shift is still on',

  },


  calendar: {

    title: 'Calendar',

    lead: 'Every day of the month on one screen',

  },


  expenses: {
    title: 'Expenses',
    lead: 'Every business expense for the selected month',
    add: 'Add',
    addExpense: 'Add an expense',
    amount: 'Amount',
    category: 'What for',
    kind: 'Type of expense',
    detailKind: 'Type',
    date: 'Date',
    monthly: 'Monthly',
    oneOff: 'One-off',
    perMonth: 'per month',
    perDay: 'per day',
    perDayAvg: 'Average per day',
    accrued: 'accrued',
    records: (n: number) => pl(n, 'record', 'records'),
    biggest: 'largest',
    shareOfRevenue: (percent: string) => `${percent}% of revenue`,
    activeSince: 'Active',
    until: (day: string) => `until ${day}`,
    monthlyStartNote:
      'A monthly expense starts today and accrues on its own from then on.',
    pastMonth: 'A past month does not change.',
    closedNote: 'This expense is no longer active. What accrued on past days stays.',
    outOf: (sum: string) => `of ${sum}`,
    monthlyOnes: 'Monthly expenses',
    monthlyAccrued: 'Accrued from monthly',
    periodAccrued: 'in the selected period',
    oneOffs: 'One-off expenses',
    empty: 'No expenses yet',
    emptyNote:
      "Add rent, electricity, chemicals and the rest. That's how you see the real profit of the business.",
    remove: 'Remove',
    removeTitle: 'Remove the expense?',
    removeMonthlyNote: 'From today it stops accruing. Past days keep what they had.',
    removeOneOffNote: 'This expense will be removed from the books.',
    note: 'Monthly expenses (rent, electricity) are spread across every day of the month. One-off ones stay in their own day.',
    changeNote: 'When you change a monthly amount, past days keep the old one. The new one applies from today.',
    kindOneNote: 'stays in today',
    kindMonthlyNote: 'spreads across every day of the month',
    common: 'Frequent',
    hints: ['Chemicals', 'Rent', 'Electricity', 'Water', 'Equipment', 'Repairs'],
  },

  owner: {
    tabToday: 'Today',
    tabPayroll: 'Payroll',
    tabClients: 'Clients',
    tabSettings: 'Settings',
    revenue: 'Revenue',
    /* Мобильная сводка: подписи под полосой разреза и в строке фактов.
       Те же слова, что в приложении (summary.served, summary.toStaff,
       summary.paidIn) — экран один, и называться на нём одно и то же
       должно одинаково. */
    served: 'Served',
    toStaff: 'To staff',
    paidIn: 'Paid in',
    revenueToday: "Today's revenue",
    revenueMonth: "This month's revenue",
    revenuePrevMonth: "Last month's revenue",
    profit: 'Net profit',
    payrollAccrued: 'Payroll',
    avgCheck: 'Average ticket',
    cashShare: 'In cash',
    onShift: 'On shift',
    onShiftNow: 'On shift now',
    offShiftNow: 'Off shift',
    feed: 'Flow',
    earned: 'to them',
    payrollDue: 'Due',
    rate: 'rate',
    clientsTotal: 'In the base',
    clientsLoyal: 'Regulars',
    clientsFresh: 'New',
    clientsLost: 'Long gone',
    clientsLifetime: 'Brought in total',
    clientsLead: 'Client history and repeat visits',
    allClients: 'All',
    visits: 'visits',
    visitsCount: (n: number) => `${n} ${pl(n, 'visit', 'visits')}`,
    lostFor: (days: number) => `gone for ${days} ${pl(days, 'day', 'days')}`,
    lastVisitToday: 'today',
    lastVisitAgo: (days: number) => `${days} ${pl(days, 'day', 'days')} ago`,
    daysShort: 'd',
    toPay: 'Due',
    clientsSearch: 'Plate, name or phone',
    clientsNotFound: 'No such plate',
    clientsEmpty: 'Clients appear on their own',
    clientsEmptyNote:
      'After the first wash the car lands in the base with visits, money spent and history.',
    clientHabits: 'Habits',
    clientFirstVisit: 'First visit',
    clientOftenTakes: 'Usually takes',
    clientOftenPays: 'Usually pays',
    clientOftenServed: 'Usually served by',
    sortRecent: 'Last visit',
    sortOften: 'Most frequent',
    sortRichest: 'Spent the most',
    lastVisitPrefix: 'last:',
    clientHistory: 'Visit history',
    clientHistoryFailed: 'Could not load the visit history',
    clientPerOne: 'Per client',
    clientAvg: 'average',
    clientLoyal: 'regular',
    clientOne: 'client',
    clientsCount: (n: number) => `${n} ${pl(n, 'client', 'clients')}`,
    clientContacts: 'Contact',
    clientName: 'Name',
    clientPhone: 'Phone',
    clientCall: 'Call',
    clientWrite: 'Message',
    clientLostHint: 'Long gone, call or offer a discount',
    clientNoPhone: 'No phone on file',
    payoutHistory: 'Payout history',
    cancelOrder: 'Cancel',
    confirmCancel: 'Cancel this record?',
    periodToday: 'Today',
    periodMonth: 'This month',
    periodPrevMonth: 'Last month',
    emptySummaryToday: 'No data yet today',
    emptySummaryMonth: 'No data yet this month',
    emptySummaryPrevious: 'No data for last month',
    emptySummaryNote: 'Your summary appears after the first car is served.',
    periodLabel: 'Period',

    vsPrev: 'vs previous',
    kept: 'net profit',
    perUnit: 'per one',
    costs: 'Expenses',
    payroll: 'payroll',
    vsLastWeek: 'A week ago at this hour',
    vsPrevPeriod: 'Last month',
    inTheRed: "You're in the red",
    emptyToday: 'No records today yet',

    colService: 'Service',
    avgShort: 'average',
    timesShort: 'times',
    timesCount: (n: number) => `${n} ${pl(n, 'time', 'times')}`,
    colPayment: 'Payment',
    colPrice: 'Price',
    colShare: 'Share',
    colTime: 'Time',
    feedTotal: 'Total',
    rowActions: 'Actions',
    copyKey: 'Copy',
    copiedKey: 'Copied',
    openClient: 'Open client',
    clientsTotalSpent: 'Total',
    lastVisit: 'Last visit',
    profitBreakdown: 'Breakdown',
    clientsLostNote: (count: number) =>
      `${pl(count, 'This', 'These')} ${count} ${pl(count, 'client is', 'clients are')} money already on the table. Bringing an old client back is cheaper than finding a new one.`,
  },

  activity: {
    title: 'Live feed',
    all: 'All activity',
    lead: 'What is happening at the wash: cars, shifts, money, team',
    live: 'live',
    paused: 'updates paused',
    empty: 'Nothing has happened yet',
    emptyNote: 'Events appear when someone starts a shift or records a car',
    emptyFilter: 'No events match this filter',
    showAll: 'Show all activity',
    more: 'Show more',
    system: 'System',
    someone: 'Someone',
    who: 'Who',
    anyone: 'Everyone',
    period: 'Period',
    today: 'Today',
    yesterday: 'Yesterday',
    groups: {
      all: 'All',
      cars: 'Cars',
      shifts: 'Shifts',
      money: 'Money',
      team: 'Team',
      catalog: 'Services and settings',
      clients: 'Clients',
    },
    types: {
      'shift.started': 'Shift started',
      'shift.finished': 'Shift finished',
      'car.created': 'New car',
      'car.updated': 'Crew changed',
      'car.canceled': 'Car canceled',
      'expense.created': 'New expense',
      'expense.updated': 'Expense edited',
      'expense.deleted': 'Expense removed',
      'employee.created': 'New employee',
      'employee.updated': 'Employee edited',
      'employee.removed': 'Employee deactivated',
      'salary.changed': 'Percent changed',
      'service.created': 'New service',
      'service.updated': 'Service edited',
      'service.archived': 'Service removed',
      'client.created': 'New client',
      'payout.made': 'Payout',
      'pass.sold': 'Pass sold',
      'settings.changed': 'Settings',
    },
    details: {
      instead: (sum: string) => `instead of ${sum}`,
      together: (names: string) => `with ${names}`,
      cashExpected: (sum: string) => `cash ${sum}`,
      cashDeclared: (sum: string) => `handed over ${sum}`,
      notDeclared: 'not declared',
      auto: 'closed automatically',
      monthly: 'per month',
      days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
      uses: (n: number) => `${n} ${n === 1 ? 'wash' : 'washes'}`,
      off: 'off',
      settings: {
        business: 'business name',
        teamPercent: 'team percent',
        tiers: 'tiers',
      },
    },
  },

  reports: {
    title: 'Report',
    note: 'How revenue, expenses and profit move',
    trend: 'Month by month',
    byMonth: 'By month',
    month: 'Month',
    whereGone: 'Where it went',
    whereFrom: 'Where it came from',
    discounts: 'Discounts',
    emptyMonth: 'There was no work this month',
    emptyAll: 'Reports appear once there is data',
    emptyAllNote: 'Log the first car to start collecting statistics.',
    emptyAllCta: 'Go to the shift',
    toPayroll: 'Go to payroll',

    lead: 'How much the business earned, where the money went and what to improve',
    period: 'Period',
    periods: {
      today: 'Today',
      week: 'Week',
      month: 'Month',
      prevmonth: 'Last month',
      custom: 'Range',
    },
    pickRange: 'Pick dates',
    apply: 'Apply',
    compare: 'Compare with previous',
    compareShort: 'Compare',
    prevPeriod: 'Previous period',
    branch: 'Location',
    scopes: {
      current: 'Current',
      all: 'All locations',
      compare: 'By location',
    },
    tabs: {
      overview: 'Overview',
      finance: 'Finance',
      operations: 'Operations',
      team: 'Team',
    },
    kpi: {
      revenue: 'Revenue',
      net: 'Net profit',
      cars: 'Cars',
      avgCheck: 'Average ticket',
      payroll: 'Payroll',
      costs: 'Expenses',
      ofRevenue: 'of revenue',
      perDay: (n: string) => `${n} per day`,
    },
    charts: {
      dynamics: 'Dynamics',
      dynamicsNote: 'Revenue, payroll, expenses and net profit',
      series: { revenue: 'Revenue', payroll: 'Payroll', costs: 'Expenses', net: 'Net profit', prev: 'Previous' },
      cars: 'Cars',
      carsNote: 'Count per day and average',
      avgCheck: 'Average ticket',
      avgCheckNote: 'How the amount per car changes',
      average: 'average',
      heatmap: 'Busy hours',
      heatmapNote: 'Weekday × hour: when cars arrive most',
      heatmapEmpty: 'The hourly picture appears with the first cars',
      less: 'less',
      more: 'more',
      services: 'Services',
      servicesNote: 'What is ordered most and what brings money',
      service: 'Service',
      times: 'Times',
      revenue: 'Revenue',
      share: 'Share',
      team: 'Team',
      teamNote: 'Cars, revenue, earned, shifts',
      person: 'Employee',
      earned: 'Earned',
      shifts: 'Shifts',
      hours: 'Hours',
      perShift: 'h/shift',
      payments: 'Payment methods',
      paymentsNote: 'Cash, card, transfer',
      costs: 'Expenses by category',
      costsNote: 'Amount, share and change versus the previous period',
      category: 'Category',
      amount: 'Amount',
      change: 'Change',
      new: 'new',
      branches: 'Locations compared',
      branchesNote: 'The same period for every location',
      failed: 'This block failed to load',
      noData: 'No data for this period',
    },
    exportCsv: 'Download CSV',
  },

  alerts: {
    title: 'Attention',
    empty: 'All good',
    emptyNote: 'Nothing to do. When something needs attention, it shows up here.',
    later: 'Later',
    lostTitle: (count: number) =>
      `${count} ${pl(count, 'client has', 'clients have')} been gone a long time`,
    lostNote: (days: number) =>
      `More than ${days} ${pl(days, 'day', 'days')}. A call is cheaper than a new client.`,
    lostAction: 'Look and call',
    payrollTitle: "It's time to pay wages",
    payrollNote: (days: number) =>
      `Money for the work has been waiting ${days} ${pl(days, 'day', 'days')}.`,
    payrollAction: 'Open payroll',
  },

  nav: {
    operations: 'WORK',
    finance: 'MONEY',
    management: 'MANAGEMENT',
    system: 'SYSTEM',
  },

  phone: {
    tabShift: 'Shift',
    tabSummary: 'Summary',
    tabPayroll: 'Payroll',
    tabMore: 'More',
    tabsAria: 'Main sections',
    tabAdd: 'Add a car',
    tabsPick: 'Tab bar',
    tabsPickNote: 'How the bottom bar of sections looks',
    tabsGrape: 'Grape',
    tabsLight: 'Light',
    tabsBar: 'With labels',
    tabsInk: 'Graphite',
    tabsPill: 'Lime',

    moreTitle: 'More',
    moreLead: 'The map of your business',

    clientsLead: 'Visits and car history',
    servicesLead: 'Services, prices, terms',
    expensesLead: 'Rent, supplies, one-off spending',
    reportsLead: 'Month against month',
    passesLead: 'Passes and the balance left',
    team: 'Team',
    teamLead: 'staff and percentages',
    points: 'Locations',
    profile: 'Profile',
    profileLead: 'Profile and access',
    settingsLead: 'Business data and settings',

    quick: 'Quick',
    addExpense: 'Expense',
    openShift: 'Shift',
    exportLead: 'the last 30 days',

    flow: 'How the day went',
  },

  settings: {
    services: 'Services and prices',
    tabServices: 'Services',
    tabData: 'Data',
    lead: 'Business settings and data',
    servicesLead: 'Services, prices and the terms you work by',
    createService: 'Create service',
    servicesEmpty: 'No services yet',
    servicesEmptyNote:
      'Add what you sell, with a price. The washer picks from the list when logging, and the price goes into the record.',
    exportNote:
      'The file holds every record from the last 30 days: car, service, price, payment method, washer and their share. Opens in Excel.',
    staff: 'Staff',
    business: 'Business',
    addService: 'Add a service',
    addStaff: 'Add a staff member',
    staffLead: 'Who works and what they bring in',
    staffEmpty: 'No staff yet',
    staffEmptyNote:
      'Add a washer. He signs in from his own phone, logs cars, and payroll adds itself up.',
    access: 'Access',
    role: 'Role',
    pinHidden: 'Not shown',
    staffNote:
      'Staff sign in with their own phone and a PIN. Read them the PIN, no password to remember.',
    removeStaffNote:
      'The employee will be deactivated and lose access. Records and payroll history stay.',
    removeServiceNote: 'The service leaves the price list. Existing records stay unchanged.',
    price: 'Price',
    percent: 'Percentage',
    name: 'Name',
    active: 'Active',
    businessName: 'Business name',
    saved: 'Saved',
    exportEarned: 'Payroll',
    exportCanceled: 'Cancelled',
    export: 'Data export',
    exportCsv: 'Download 30 days of data (Excel)',
    save: 'Save',
    remove: 'Remove',
    newService: 'New service',
    percentNote:
      'A percentage change applies to new records. What is already calculated and paid does not change.',
    priceNote:
      "A price change does not affect records already made. Yesterday's revenue and payroll stay as they were.",

    tiers: 'Classes',
    tiersLead: 'A jeep and a sedan do not cost the same. Classes apply to the whole price list.',
    tiersLabel: 'What it is called',
    tiersLabelHint: 'Class, Body type — whatever you say at the wash',
    tiersOff: 'Classes are off. Add two to turn them on.',
    tiersTooFew: 'One class is not a class. Add a second one or remove them all.',
    tiersOn: (n: number) => `${n} classes. Every service gets its own prices.`,
    addTier: 'Add a class',
    tierName: 'Class name',
    tierPrices: 'Prices by class',
    tierPriceHint: 'Empty means the base price',

    pinReset: 'Issue a new PIN',

    pinResetNote: 'The staff member forgot the PIN. Set a new one, sign-ins with the old PIN will close.',

    pinResetDone: 'The PIN is changed. Pass it to the staff member.',

    pinWorksElsewhere: 'This person works elsewhere too. They change the PIN themselves, from their own page.',


    deleteTitle: 'Delete the business',
    deleteWhat:
      'Everything goes: records, clients, services and all staff. Staff access closes immediately.',
    deleteNoWayBack: 'It cannot be restored.',
    deletePin: 'Confirm with your PIN',
    deleteKeep: 'Download the data and delete',
    deleteWipe: 'Delete without downloading',
    deleteHint: 'The file downloads for Excel, then the business is deleted.',
    deleteWrongPin: 'The PIN is wrong.',
    deleteThrottled: 'Too many attempts. Wait and try again.',
    deleteFailed: "Couldn't do it. Try again.",
    deleteSendCode: 'Send a confirmation code',
    deleteCodeAsk: 'Confirm with the code from SMS',
    deleteCodeSent: (phone: string) => `The code went to ${phone}.`,
    deleteCodeWrong: 'The code is wrong.',
    deleteCodeExpired: 'The code has expired. Send a new one.',
    deleteSmsFailed: "Couldn't send the SMS. Try again.",
  },
};
