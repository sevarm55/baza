import type { AuthDict } from './auth-hy';

/** Русский. Форма та же, что у армянского: TypeScript не даст забыть ключ. */
export const authRu: AuthDict = {
  brand: 'Tetrin',

  login: {
    title: 'С возвращением',
    subtitle: 'Войдите, чтобы продолжить работу',
    phone: 'Номер телефона',
    pin: 'PIN-код',
    submit: 'Войти',
    submitting: 'Входим…',
    forgot: 'Забыли PIN?',
    welcomeBack: 'Снова здравствуйте',
    tapAvatar: 'Нажмите на аватар, чтобы войти',
    anotherAccount: 'Войти под другим номером',
    rememberedExpired: 'Срок сохранённого входа истёк. Введите телефон и PIN.',
  },

  register: {
    title: 'Создайте автомойку',
    subtitle: 'Настройка займёт меньше минуты',
    businessName: 'Название автомойки',
    ownerName: 'Ваше имя',
    phone: 'Номер телефона',
    pin: 'Создайте PIN',
    pinHint: 'Используйте 6 цифр, которые сможете запомнить',
    submit: 'Продолжить',
    submitting: 'Отправляем…',
    freeDays: (days: number) => `${days} дней бесплатно. Карта не нужна.`,
    haveAccount: 'Уже есть аккаунт?',
  },

  otp: {
    title: 'Подтвердите номер',
    description: (phone: string) => `Мы отправили код на ${phone}`,
    code: 'Код из SMS',
    verify: 'Подтвердить',
    verifying: 'Проверяем…',
    resend: 'Отправить код повторно',
    resendIn: (mmss: string) => `Отправить повторно через ${mmss}`,
    resendsLeft: (n: number) => `Осталось попыток: ${n}`,
    changePhone: 'Изменить номер',
    success: 'Всё готово',
  },

  stepUp: {
    title: 'Дополнительная проверка',
    description: (phone: string) =>
      `Вход с незнакомого устройства. Мы отправили код на ${phone}`,
  },

  forgotPin: {
    title: 'Восстановление PIN',
    subtitle: 'Введите номер — пришлём код подтверждения',
    newPin: 'Новый PIN',
    newPinHint: 'Используйте 6 цифр, которые сможете запомнить',
    submit: 'Отправить код',
    save: 'Сохранить новый PIN',
    done: 'PIN изменён',
    doneNote: 'Все другие устройства вышли.',
    backToLogin: 'Вернуться ко входу',
  },

  tabs: {
    signIn: 'Вход',
    register: 'Регистрация',
  },

  pin: {
    groupLabel: (n: number) => `PIN-код, ${n} цифр`,
    otpGroupLabel: (n: number) => `Код подтверждения, ${n} цифр`,
    show: 'Показать код',
    hide: 'Скрыть код',
    entered: (n: number, total: number) => `Введено ${n} из ${total}`,
  },

  phone: {
    country: 'Код страны',
    label: 'Номер телефона',
  },

  errors: {
    invalidCredentials: 'Не удалось войти. Проверьте номер телефона и PIN.',
    tooManyAttempts: (minutes: number) =>
      `Слишком много попыток. Попробуйте через ${minutes} мин.`,
    network: 'Проблема со связью. Попробуйте ещё раз.',
    server: 'Что-то пошло не так. Попробуйте ещё раз.',
    offline: 'Нет соединения с интернетом',
    otpInvalid: 'Код неверный',
    otpExpired: 'Срок кода истёк. Запросите новый.',
    otpTooMany: 'Слишком много попыток. Запросите новый код.',
    otpResendTooSoon: 'Немного подождите перед новым кодом',
    smsFailed: 'Не удалось отправить SMS. Попробуйте позже.',
    phoneTaken: 'Этот номер уже зарегистрирован',
    badPhone: 'Неверный номер телефона',
    pinLength: 'PIN должен состоять из 6 цифр',
    pinTrivial: 'Выберите менее очевидный PIN',
    required: 'Заполните все поля',
  },

  security: {
    verifyPhone: 'Подтвердите свой номер',
    verifyPhoneNote:
      'Без подтверждённого номера восстановить PIN нельзя. Займёт полминуты.',
    verifyNow: 'Подтвердить',
    later: 'Позже',
    verified: 'Номер подтверждён',
  },
};
