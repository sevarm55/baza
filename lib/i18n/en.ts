import type { Dict } from './hy';
import { BRAND } from '../brand';

/**
 * English interface of Tetrin.
 *
 * Written as product copy, not as a translation. Same rules that shaped
 * the Armenian original hold here:
 *
 *  — "You keep" instead of "profit": two near-identical words with two
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
    language: 'Language',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeDarkLong: 'Dark theme',
    themeLightLong: 'Light theme',
  },

  meta: {
    landingTitle: 'Tetrin | Your car wash, under control',
    landingDescription:
      'Cars, staff, payroll and what is actually left — in one simple system.',
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
    eyebrow: 'For car washes',
    headline: 'Every car — logged.',
    headlineAccent: 'Every dram — accounted for.',
    lead: 'The washer logs it himself, because that is where he sees his own pay.',
    ctaPrimary: (days: number) => `Try ${days} ${pl(days, 'day', 'days')} free`,
    ctaNote: 'No card. Three minutes.',

    steps: [
      {
        title: 'Three taps — and the car is logged',
        body: 'Plate, service, payment.',
        caption: "Washer's screen",
        alt: "A washer's wet hand on the door of a washed car",
      },
      {
        title: 'Who washed how many',
        body: 'Every record carries a name.',
        caption: 'The day as it goes',
        alt: 'Two washers at two different cars',
      },
      {
        title: 'Payroll adds itself up',
        body: 'No calculator, no arguments.',
        caption: 'Payroll',
        alt: 'Cash passed from hand to hand',
      },
      {
        title: 'You keep',
        body: 'Revenue minus payroll and expenses. Every day.',
        caption: "Owner's screen",
        alt: 'Water beads on the white body of a washed car',
      },
    ],

    heroAlt: 'A washed car in a bright car-wash bay',
    priceAlt: 'A clean car leaving the wash',

    galleryEyebrow: 'At a glance',

    priceTitle: 'Price',
    pricePeriod: 'per month, per location',
    priceNote: (days: number) =>
      `First ${days} ${pl(days, 'day', 'days')} free. No card needed.`,
    footer: 'Tetrin — bookkeeping for service businesses',
  },

  errors: {
    required: 'Fill in every field',
    badPhone: 'Invalid phone number',
    badPin: 'PIN must be 4 digits',
    badPercent: 'Percentage must be between 0 and 100',
    generic: 'Something went wrong',
  },

  auth: {
    signInTitle: 'Sign in',
    note: 'No card. Three minutes.',
    phone: 'Phone',
    pin: 'PIN',
    signIn: 'Sign in',
    signOut: 'Sign out',
    welcomeBack: 'Welcome back',
    tapAvatar: 'Tap your avatar to sign in',
    anotherAccount: 'Sign in with another number',
    rememberedExpired: 'The saved sign-in has expired. Enter your phone and PIN.',
    wrongCredentials: 'Wrong phone or PIN',
    phoneTaken: 'This number is already registered',

    pinHint: '4 digits',
    tooManyTries: (minutes: number) =>
      `Too many attempts. Try again in ${minutes} ${pl(minutes, 'minute', 'minutes')}.`,

    changePin: 'Change PIN',
    currentPin: 'Current PIN',
    newPin: 'New PIN',
    wrongPin: 'The current PIN is wrong',
    pinChangedNote: 'After the change every device signs out, including this one.',
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

  profile: {
    title: 'My page',
    access: 'Subscription',
    session: 'This device',
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
      'Your data is where it was — revenue, payroll, the client base — and you can download it. To start logging again, renew the subscription.',
    renew: 'Get in touch to renew',
    blockedTitle: 'Access is closed',
    blockedText:
      'Your data is saved and nothing is lost. Get in touch to restore access.',

    wallTitle: 'The term has ended',
    wallLead: 'Your data is where it was: records, revenue, the client base. Nothing is lost.',
    wallContinue: 'To continue, call',
    wallPhone: '+374 99 855 546',
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
    needsPayment: 'awaiting payment',
    go: 'open',
    here: "you're here",
    add: 'Add a location',
    noTrial: 'The trial is given once. A new location starts working after payment.',
    price: (sum: string) => `${sum} per month for each.`,
    freshTitle: 'Location created',
    freshText:
      'It starts after payment. Your other locations work as before — open any of them.',
  },

  work: {
    earnedToday: 'You earned today',
    shiftRevenue: 'Shift revenue',

    worksTotal: 'Work total',
    yourShare: (percent: number) => `your share — ${percent}%`,

    onShift: "I'm on shift",
    shiftNotStarted: 'Shift not started yet',
    shiftDone: 'Shift finished',
    since: (time: string) => `since ${time}`,
    lasted: (hours: number, minutes: number) =>
      hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`,
    range: (from: string, to: string) => `${from} — ${to}`,

    startShift: 'Start shift',
    endShift: 'End shift',
    needShift: 'Start your shift to log work',

    endTitle: 'End the shift?',
    endConfirm: 'End',
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
    addFor: (unit: string, sum: string) => `Add ${unit} · ${sum}`,
    saved: 'Logged',
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

  payroll: {
    tabDue: 'Due',
    tabHistory: 'History',
    lead: 'Payroll calculations and payouts',

    unpaid: 'Unpaid',
    paid: 'Paid',
    paidOn: (day: string, time: string) => `Paid ${day}, ${time}`,
    alreadyPaid: (sum: string) => `already — ${sum}`,

    pay: 'Pay',
    paySum: (sum: string) => `Pay ${sum}`,
    selected: (count: number) => `${count} selected`,
    selectAll: 'Select all',

    confirmTitle: 'Confirm the payout',
    confirmNote: 'Once confirmed, these calculations are marked as paid.',
    confirm: 'Confirm',
    done: (sum: string) => `Payout recorded — ${sum}`,
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
      'The money arrives at the moment of sale. Each use creates no revenue — so the same money is not counted twice. But the washer did wash the car, and he gets his percentage.',
    empty: 'No passes yet',
  },

  legal: {
    privacy: 'Privacy policy',
    support: 'Support',
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
      "Add rent, electricity, chemicals and the rest — that's how you see the real profit of the business.",
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
    revenueToday: "Today's revenue",
    revenueMonth: "This month's revenue",
    revenuePrevMonth: "Last month's revenue",
    profit: 'You keep',
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
      'After the first wash the car lands in the base — with visits, money spent and history.',
    clientHabits: 'Habits',
    clientFirstVisit: 'First visit',
    clientOftenTakes: 'Usually takes',
    clientOftenPays: 'Usually pays',
    clientOftenServed: 'Usually served by',
    sortRecent: 'Last visit',
    sortOften: 'Most frequent',
    sortRichest: 'Spent the most',
    lastVisitPrefix: 'last —',
    clientHistory: 'Visit history',
    clientAvg: 'average',
    clientLoyal: 'regular',
    clientOne: 'client',
    clientsCount: (n: number) => `${n} ${pl(n, 'client', 'clients')}`,
    clientContacts: 'Contact',
    clientName: 'Name',
    clientPhone: 'Phone',
    clientCall: 'Call',
    clientWrite: 'Message',
    clientLostHint: 'Long gone — call or offer a discount',
    clientNoPhone: 'No phone on file',
    payoutHistory: 'Payout history',
    cancelOrder: 'Cancel',
    confirmCancel: 'Cancel this record?',
    periodToday: 'Today',
    periodMonth: 'This month',
    periodPrevMonth: 'Last month',
    periodLabel: 'Period',

    vsPrev: 'vs previous',
    kept: 'kept',
    perUnit: 'per one',
    costs: 'Expenses',
    payroll: 'payroll',
    vsLastWeek: 'A week ago at this hour',
    vsPrevPeriod: 'Last month',
    inTheRed: "You're in the red",
    noBase: 'Nothing to compare with',
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

  reports: {
    title: 'Report',
    note: 'How revenue, expenses and profit move',
    trend: 'Month by month',
    byMonth: 'By month',
    month: 'Month',
    whereGone: 'Where it went',
    whereFrom: 'Where it came from',
    emptyMonth: 'There was no work this month',
    toPayroll: 'Go to payroll',
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
      `${days} ${pl(days, 'day has', 'days have')} passed since the last payout.`,
    payrollAction: 'Open payroll',
  },

  nav: {
    finance: 'MONEY',
    management: 'MANAGEMENT',
  },

  settings: {
    services: 'Services and prices',
    tabServices: 'Services',
    tabData: 'Data',
    lead: 'Services, prices and business settings',
    servicesEmpty: 'No services yet',
    servicesEmptyNote:
      'Add what you sell, with a price. The washer picks from the list when logging, and the price goes into the record.',
    exportNote:
      'The file holds every record from the last 30 days — car, service, price, payment method, washer and their share. Opens in Excel.',
    staff: 'Staff',
    business: 'Business',
    addService: 'Add a service',
    addStaff: 'Add a staff member',
    staffLead: 'Who works and what they bring in',
    staffEmpty: 'No staff yet',
    staffEmptyNote:
      'Add a washer — he signs in from his own phone, logs cars, and payroll adds itself up.',
    access: 'Access',
    role: 'Role',
    pinHidden: 'Not shown',
    staffNote:
      'Staff sign in with their own phone and a PIN. Read them the PIN — no password to remember.',
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

    deleteTitle: 'Delete the business',
    deleteWhat:
      'Everything goes — records, clients, services and all staff. Staff access closes immediately.',
    deleteNoWayBack: 'It cannot be restored.',
    deletePin: 'Confirm with your PIN',
    deleteKeep: 'Download the data and delete',
    deleteWipe: 'Delete without downloading',
    deleteHint: 'The file downloads for Excel, then the business is deleted.',
    deleteWrongPin: 'The PIN is wrong.',
    deleteThrottled: 'Too many attempts. Wait and try again.',
    deleteFailed: "Couldn't do it. Try again.",
  },
};
