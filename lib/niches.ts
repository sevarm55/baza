/**
 * Конфиги ниш.
 *
 * Это ДАННЫЕ, а не логика. Ядро приложения про ниши ничего не знает:
 * конфиг используется ровно один раз — при регистрации бизнеса, чтобы
 * засеять услуги и подставить термины в поля тенанта. Дальше владелец
 * правит всё сам, а код работает с тем, что лежит в БД.
 *
 * Добавить новую нишу = добавить объект сюда. Больше ничего.
 */

export type NicheKey =
  | 'carwash'
  | 'dental'
  | 'autoservice'
  | 'barber'
  | 'cleaning'
  | 'vet';

export type Niche = {
  key: NicheKey;
  icon: string;
  /**
   * Показывать ли нишу при регистрации.
   *
   * Продаём сейчас только автомойкам, и выбор из шести вариантов размывает
   * сообщение. Конфиги остальных не удаляем: ядро ради них и построено,
   * вернуть — поменять флаг.
   */
  enabled: boolean;
  /** Название ниши, показывается на экране выбора */
  name: string;
  /** Одна строка: что болит в этой нише */
  tag: string;
  /** Как называется идентификатор клиента: номер машины / телефон */
  clientIdLabel: string;
  clientIdPlaceholder: string;
  clientIdType: 'plate' | 'phone';
  /** Как зовут исполнителя: мойщик / врач / мастер */
  staffRole: string;
  staffRolePlural: string;
  /** Процент исполнителя по умолчанию */
  defaultPercent: number;
  /** Единица учёта: машина / приём / заказ */
  unitOne: string;
  unitMany: string;
  /** Надпись на главной кнопке сотрудника */
  addLabel: string;
  /** Имена для демо-данных */
  demoStaff: string[];
  /** Услуги, которыми засевается новый бизнес. Цены в минимальных единицах валюты. */
  services: { name: string; price: number }[];
};

export const NICHES: Record<NicheKey, Niche> = {
  carwash: {
    key: 'carwash',
    enabled: true,
    icon: '🚿',
    name: 'Ավտոլվացում',
    tag: 'Հերթափոխ, լվացողներ, տոկոս մեքենայից',
    clientIdLabel: 'Պետհամարանիշ',
    clientIdPlaceholder: '12 AB 345',
    clientIdType: 'plate',
    staffRole: 'Լվացող',
    staffRolePlural: 'Լվացողներ',
    defaultPercent: 40,
    unitOne: 'մեքենա',
    unitMany: 'մեքենա',
    addLabel: 'Նոր մեքենա',
    demoStaff: ['Աշոտ', 'Դավիթ', 'Տիգրան'],
    services: [
      { name: 'Կոմպլեքս', price: 5000 },
      { name: 'Թափք', price: 3000 },
      { name: 'Սալոն', price: 2500 },
      { name: 'Քիմմաքրում', price: 12000 },
      { name: 'Փայլեցում', price: 20000 },
    ],
  },

  dental: {
    key: 'dental',
    enabled: false,
    icon: '🦷',
    name: 'Ատամնաբուժարան',
    tag: 'Ընդունելություններ, բժիշկներ, հիվանդների բազա',
    clientIdLabel: 'Հիվանդի հեռախոս',
    clientIdPlaceholder: '+374 77 123 456',
    clientIdType: 'phone',
    staffRole: 'Բժիշկ',
    staffRolePlural: 'Բժիշկներ',
    defaultPercent: 35,
    unitOne: 'ընդունելություն',
    unitMany: 'ընդունելություն',
    addLabel: 'Նոր ընդունելություն',
    demoStaff: ['Դր. Հարությունյան', 'Դր. Սարգսյան', 'Դր. Պետրոսյան'],
    services: [
      { name: 'Զննում', price: 3000 },
      { name: 'Մաքրում', price: 15000 },
      { name: 'Պլոմբ', price: 25000 },
      { name: 'Հեռացում', price: 20000 },
      { name: 'Իմպլանտ', price: 150000 },
    ],
  },

  autoservice: {
    key: 'autoservice',
    enabled: false,
    icon: '🔧',
    name: 'Ավտոսերվիս',
    tag: 'Պատվերներ, վարպետներ, մեքենայի պատմություն',
    clientIdLabel: 'Պետհամարանիշ',
    clientIdPlaceholder: '34 CD 789',
    clientIdType: 'plate',
    staffRole: 'Վարպետ',
    staffRolePlural: 'Վարպետներ',
    defaultPercent: 35,
    unitOne: 'պատվեր',
    unitMany: 'պատվեր',
    addLabel: 'Նոր պատվեր',
    demoStaff: ['Կարեն', 'Գոռ', 'Վահան'],
    services: [
      { name: 'Յուղի փոխարինում', price: 8000 },
      { name: 'Ախտորոշում', price: 5000 },
      { name: 'Արգելակներ', price: 25000 },
      { name: 'Կախոց', price: 40000 },
      { name: 'Անվադողերի փոխարինում', price: 6000 },
    ],
  },

  barber: {
    key: 'barber',
    enabled: false,
    icon: '💈',
    name: 'Բարբերշոփ',
    tag: 'Հաճախորդներ, բարբերներ, տոկոս սանրվածքից',
    clientIdLabel: 'Հաճախորդի հեռախոս',
    clientIdPlaceholder: '+374 91 555 010',
    clientIdType: 'phone',
    staffRole: 'Բարբեր',
    staffRolePlural: 'Բարբերներ',
    defaultPercent: 45,
    unitOne: 'հաճախորդ',
    unitMany: 'հաճախորդ',
    addLabel: 'Նոր հաճախորդ',
    demoStaff: ['Նարեկ', 'Արթուր', 'Սուրեն'],
    services: [
      { name: 'Սանրվածք', price: 4000 },
      { name: 'Մորուք', price: 3000 },
      { name: 'Կոմպլեքս', price: 6000 },
      { name: 'Մանկական', price: 2500 },
      { name: 'Սափրում', price: 3500 },
    ],
  },

  cleaning: {
    key: 'cleaning',
    enabled: false,
    icon: '🧹',
    name: 'Մաքրման ծառայություն',
    tag: 'Այցեր, բրիգադներ, տոկոս օբյեկտից',
    clientIdLabel: 'Պատվիրատուի հեռախոս',
    clientIdPlaceholder: '+374 55 200 300',
    clientIdType: 'phone',
    staffRole: 'Մաքրող',
    staffRolePlural: 'Մաքրողներ',
    defaultPercent: 50,
    unitOne: 'այց',
    unitMany: 'այց',
    addLabel: 'Նոր այց',
    demoStaff: ['Աննա', 'Մարիամ', 'Լուսինե'],
    services: [
      { name: 'Բնակարան', price: 15000 },
      { name: 'Գրասենյակ', price: 25000 },
      { name: 'Գլխավոր մաքրում', price: 35000 },
      { name: 'Վերանորոգումից հետո', price: 50000 },
      { name: 'Պատուհաններ', price: 9000 },
    ],
  },

  vet: {
    key: 'vet',
    enabled: false,
    icon: '🐾',
    name: 'Անասնաբուժարան',
    tag: 'Ընդունելություններ, բժիշկներ, կենդանու քարտ',
    clientIdLabel: 'Տիրոջ հեռախոս',
    clientIdPlaceholder: '+374 98 404 505',
    clientIdType: 'phone',
    staffRole: 'Բժիշկ',
    staffRolePlural: 'Բժիշկներ',
    defaultPercent: 35,
    unitOne: 'ընդունելություն',
    unitMany: 'ընդունելություն',
    addLabel: 'Նոր ընդունելություն',
    demoStaff: ['Դր. Գրիգորյան', 'Դր. Ավանեսյան'],
    services: [
      { name: 'Ընդունելություն', price: 5000 },
      { name: 'Պատվաստում', price: 8000 },
      { name: 'Ուլտրաձայն', price: 12000 },
      { name: 'Ստերիլիզացիա', price: 45000 },
      { name: 'Խուզում', price: 7000 },
    ],
  },
};

export const NICHE_LIST = Object.values(NICHES);

/** Ниши, доступные для регистрации прямо сейчас. */
export const ACTIVE_NICHES = NICHE_LIST.filter((n) => n.enabled);

export function getNiche(key: string): Niche {
  const n = NICHES[key as NicheKey];
  if (!n) throw new Error(`Unknown niche: ${key}`);
  return n;
}

/**
 * Куда ведёт кнопка «Создать».
 *
 * Пока ниша одна, экран выбора — лишний шаг, и ссылаться на него нельзя
 * ещё по одной причине: перехват маршрута работает по адресу, а через
 * редирект с `/start` окно регистрации не откроется.
 */
export function startHref(): string {
  return ACTIVE_NICHES.length === 1 ? `/start/${ACTIVE_NICHES[0].key}` : '/start';
}

export function isNicheAvailable(key: string): boolean {
  return NICHES[key as NicheKey]?.enabled === true;
}
