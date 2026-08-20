import { DEFAULT_LOCALE, isLocale, type Locale } from './index';

/**
 * Заводские слова бизнеса на трёх языках.
 *
 * Отдельная и самая скользкая часть перевода. Термины мойки — «մեքենա»,
 * «Լվացող», «Պետհամարանիշ» — лежат не в словаре интерфейса, а в БД, в
 * колонках тенанта: они пришли туда из конфига ниши при регистрации, и
 * дальше владелец правит их сам. То есть одна и та же колонка держит и
 * НАШЕ слово, и слово ВЛАДЕЛЬЦА, а на экране они выглядят одинаково.
 *
 * Правило разделения простое и проверяемое: переводим ровно то, что
 * совпадает с заводским значением из `lib/niches.ts`. Совпало — это наша
 * подпись, её и переводим. Не совпало — владелец переписал её своими
 * словами, и трогать её нельзя ни при каком языке интерфейса: человек,
 * назвавший класс машин «Джип», должен видеть «Джип» и по-английски.
 *
 * Названия услуг живут по тому же правилу. Заводские пять строк прайса
 * человек не заводил: их положила регистрация, и на русском интерфейсе
 * «Կոմպլեքս» читался как чужая надпись посреди своего экрана. Поэтому
 * переводится ровно то, что совпало с конфигом ниши; всё, что владелец
 * назвал сам, проходит насквозь и на любом языке остаётся его словом.
 * Классы машин (`tiers`) сюда не входят: их придумывает владелец, и
 * заводского списка, с которым можно сверить, у них нет.
 */

type Forms = {
  /** Именительный единственного: «машина». */
  nom: string;
  /** Винительный: «Добавить машину». В армянском и английском совпадает. */
  acc: string;
  /** Множественное для заголовка столбца, где числа рядом нет. */
  many: string;
  /**
   * Слово в форме, которую требует число, — но без самого числа.
   *
   * Для плиток: цифра нарисована крупно, подпись мелко под ней, и в
   * строку они не склеиваются. Но читаются вместе, и «6 машины» глаз
   * ловит как опечатку.
   */
  word: (n: number) => string;
  /** «с одной машины» — подпись под средним значением. */
  fromOne: string;
  /**
   * «0 машин», «1 машина», «22 машины».
   *
   * Форма выбирается по числу, и это не косметика: «0 машина» в русском
   * читается опечаткой, а не нулём. В армянском после числительного
   * стоит единственное всегда — там функция возвращает одно и то же
   * слово, и это правильный армянский, а не заглушка.
   */
  count: (n: number) => string;
};

/** Три формы русского после числительного. */
function plRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Собрать формы разом: слишком много одинаковых строк без этого. */
function forms(
  nom: string,
  acc: string,
  many: string,
  fromOne: string,
  word: (n: number) => string,
): Forms {
  return { nom, acc, many, fromOne, word, count: (n) => `${n} ${word(n)}` };
}

const hyUnit = (w: string, fromOne: string) => forms(w, w, w, fromOne, () => w);

const enUnit = (one: string, many: string, fromOne: string) =>
  forms(one, one, many, fromOne, (n) => (Math.abs(n) === 1 ? one : many));

const ruUnit = (one: string, acc: string, few: string, many: string, fromOne: string) =>
  forms(one, acc, few, fromOne, (n) => plRu(n, one, few, many));

/** Единицы учёта. Ключ — заводское армянское слово из `NICHES[*].unitOne`. */
const UNITS: Record<string, Record<Locale, Forms>> = {
  'մեքենա': {
    hy: hyUnit('մեքենա', 'մեկ մեքենայից'),
    ru: ruUnit('машина', 'машину', 'машины', 'машин', 'с одной машины'),
    en: enUnit('car', 'cars', 'per car'),
  },
  'ընդունելություն': {
    hy: hyUnit('ընդունելություն', 'մեկ ընդունելությունից'),
    ru: ruUnit('приём', 'приём', 'приёма', 'приёмов', 'с одного приёма'),
    en: enUnit('visit', 'visits', 'per visit'),
  },
  'պատվեր': {
    hy: hyUnit('պատվեր', 'մեկ պատվերից'),
    ru: ruUnit('заказ', 'заказ', 'заказа', 'заказов', 'с одного заказа'),
    en: enUnit('order', 'orders', 'per order'),
  },
  'հաճախորդ': {
    hy: hyUnit('հաճախորդ', 'մեկ հաճախորդից'),
    ru: ruUnit('клиент', 'клиента', 'клиента', 'клиентов', 'с одного клиента'),
    en: enUnit('client', 'clients', 'per client'),
  },
  'այց': {
    hy: hyUnit('այց', 'մեկ այցից'),
    ru: ruUnit('визит', 'визит', 'визита', 'визитов', 'с одного визита'),
    en: enUnit('visit', 'visits', 'per visit'),
  },
};

/**
 * Исполнитель во множественном — «3 мойщика на смене».
 *
 * Отдельно от `STAFF_ROLES`, потому что там подпись столбца, а здесь
 * счёт людей, и в русском это разные слова.
 */
const STAFF_COUNTS: Record<string, Record<Locale, (n: number) => string>> = {
  'Լվացող': {
    hy: (n) => `${n} լվացող`,
    ru: (n) => `${n} ${plRu(n, 'мойщик', 'мойщика', 'мойщиков')}`,
    en: (n) => `${n} ${n === 1 ? 'washer' : 'washers'}`,
  },
  'Բժիշկ': {
    hy: (n) => `${n} բժիշկ`,
    ru: (n) => `${n} ${plRu(n, 'врач', 'врача', 'врачей')}`,
    en: (n) => `${n} ${n === 1 ? 'doctor' : 'doctors'}`,
  },
  'Վարպետ': {
    hy: (n) => `${n} վարպետ`,
    ru: (n) => `${n} ${plRu(n, 'мастер', 'мастера', 'мастеров')}`,
    en: (n) => `${n} ${n === 1 ? 'mechanic' : 'mechanics'}`,
  },
  'Բարբեր': {
    hy: (n) => `${n} բարբեր`,
    ru: (n) => `${n} ${plRu(n, 'барбер', 'барбера', 'барберов')}`,
    en: (n) => `${n} ${n === 1 ? 'barber' : 'barbers'}`,
  },
  'Մաքրող': {
    hy: (n) => `${n} մաքրող`,
    ru: (n) => `${n} ${plRu(n, 'клинер', 'клинера', 'клинеров')}`,
    en: (n) => `${n} ${n === 1 ? 'cleaner' : 'cleaners'}`,
  },
};

/** Как зовут исполнителя. Ключ — заводское `NICHES[*].staffRole`. */
const STAFF_ROLES: Record<string, Record<Locale, string>> = {
  'Լվացող': { hy: 'Լվացող', ru: 'Мойщик', en: 'Washer' },
  'Բժիշկ': { hy: 'Բժիշկ', ru: 'Врач', en: 'Doctor' },
  'Վարպետ': { hy: 'Վարպետ', ru: 'Мастер', en: 'Mechanic' },
  'Բարբեր': { hy: 'Բարբեր', ru: 'Барбер', en: 'Barber' },
  'Մաքրող': { hy: 'Մաքրող', ru: 'Клинер', en: 'Cleaner' },
};

/** Множественное — только для витрины ниш. */
const STAFF_PLURAL: Record<string, Record<Locale, string>> = {
  'Լվացողներ': { hy: 'Լվացողներ', ru: 'Мойщики', en: 'Washers' },
  'Բժիշկներ': { hy: 'Բժիշկներ', ru: 'Врачи', en: 'Doctors' },
  'Վարպետներ': { hy: 'Վարպետներ', ru: 'Мастера', en: 'Mechanics' },
  'Բարբերներ': { hy: 'Բարբերներ', ru: 'Барберы', en: 'Barbers' },
  'Մաքրողներ': { hy: 'Մաքրողներ', ru: 'Клинеры', en: 'Cleaners' },
};

/** По чему узнают клиента. Ключ — заводское `NICHES[*].clientIdLabel`. */
const CLIENT_ID_LABELS: Record<string, Record<Locale, string>> = {
  'Պետհամարանիշ': { hy: 'Պետհամարանիշ', ru: 'Госномер', en: 'Plate' },
  'Հիվանդի հեռախոս': { hy: 'Հիվանդի հեռախոս', ru: 'Телефон пациента', en: "Patient's phone" },
  'Հաճախորդի հեռախոս': { hy: 'Հաճախորդի հեռախոս', ru: 'Телефон клиента', en: "Client's phone" },
  'Պատվիրատուի հեռախոս': { hy: 'Պատվիրատուի հեռախոս', ru: 'Телефон заказчика', en: "Customer's phone" },
  'Տիրոջ հեռախոս': { hy: 'Տիրոջ հեռախոս', ru: 'Телефон владельца', en: "Owner's phone" },
};

/** Названия ниш — витрина регистрации. Ключ — заводское `NICHES[*].name`. */
const NICHE_NAMES: Record<string, Record<Locale, string>> = {
  'Ավտոլվացում': { hy: 'Ավտոլվացում', ru: 'Автомойка', en: 'Car wash' },
  'Ատամնաբուժարան': { hy: 'Ատամնաբուժարան', ru: 'Стоматология', en: 'Dental clinic' },
  'Ավտոսերվիս': { hy: 'Ավտոսերվիս', ru: 'Автосервис', en: 'Auto service' },
  'Բարբերշոփ': { hy: 'Բարբերշոփ', ru: 'Барбершоп', en: 'Barbershop' },
  'Մաքրման ծառայություն': { hy: 'Մաքրման ծառայություն', ru: 'Клининг', en: 'Cleaning service' },
  'Անասնաբուժարան': { hy: 'Անասնաբուժարան', ru: 'Ветклиника', en: 'Vet clinic' },
};

/** Одна строка про боль ниши. Ключ — заводское `NICHES[*].tag`. */
const NICHE_TAGS: Record<string, Record<Locale, string>> = {
  'Հերթափոխ, լվացողներ, տոկոս մեքենայից': {
    hy: 'Հերթափոխ, լվացողներ, տոկոս մեքենայից',
    ru: 'Смены, мойщики, процент с машины',
    en: 'Shifts, washers, a percentage per car',
  },
  'Ընդունելություններ, բժիշկներ, հիվանդների բազա': {
    hy: 'Ընդունելություններ, բժիշկներ, հիվանդների բազա',
    ru: 'Приёмы, врачи, база пациентов',
    en: 'Visits, doctors, a patient base',
  },
  'Պատվերներ, վարպետներ, մեքենայի պատմություն': {
    hy: 'Պատվերներ, վարպետներ, մեքենայի պատմություն',
    ru: 'Заказы, мастера, история машины',
    en: 'Orders, mechanics, a car’s history',
  },
  'Հաճախորդներ, բարբերներ, տոկոս սանրվածքից': {
    hy: 'Հաճախորդներ, բարբերներ, տոկոս սանրվածքից',
    ru: 'Клиенты, барберы, процент со стрижки',
    en: 'Clients, barbers, a percentage per cut',
  },
  'Այցեր, բրիգադներ, տոկոս օբյեկտից': {
    hy: 'Այցեր, բրիգադներ, տոկոս օբյեկտից',
    ru: 'Визиты, бригады, процент с объекта',
    en: 'Visits, crews, a percentage per site',
  },
  'Ընդունելություններ, բժիշկներ, կենդանու քարտ': {
    hy: 'Ընդունելություններ, բժիշկներ, կենդանու քարտ',
    ru: 'Приёмы, врачи, карта питомца',
    en: 'Visits, doctors, a pet chart',
  },
};

/** Надпись на главной кнопке сотрудника. Ключ — заводское `NICHES[*].addLabel`. */
const ADD_LABELS: Record<string, Record<Locale, string>> = {
  'Նոր մեքենա': { hy: 'Նոր մեքենա', ru: 'Новая машина', en: 'New car' },
  'Նոր ընդունելություն': { hy: 'Նոր ընդունելություն', ru: 'Новый приём', en: 'New visit' },
  'Նոր պատվեր': { hy: 'Նոր պատվեր', ru: 'Новый заказ', en: 'New order' },
  'Նոր հաճախորդ': { hy: 'Նոր հաճախորդ', ru: 'Новый клиент', en: 'New client' },
  'Նոր այց': { hy: 'Նոր այց', ru: 'Новый визит', en: 'New visit' },
};

/**
 * Названия заводских услуг. Ключ — заводское `NICHES[*].services[].name`.
 *
 * Здесь весь прайс, которым регистрация засевает бизнес, включая ниши,
 * которые пока выключены: услуга живёт в базе годами, а флаг ниши
 * меняется одной строкой, и таблица не должна отставать от конфига.
 *
 * Одно армянское слово стоит в двух нишах («Կոմպլեքս» у мойки и у
 * барбершопа) — перевод у него один на оба, потому что ключ здесь слово,
 * а не пара «ниша + слово». Разводить их пришлось бы только ради разных
 * переводов одного и того же, а их нет.
 */
const SERVICE_NAMES: Record<string, Record<Locale, string>> = {
  /* Автомойка */
  'Կոմպլեքս': { hy: 'Կոմպլեքս', ru: 'Комплекс', en: 'Full wash' },
  'Թափք': { hy: 'Թափք', ru: 'Кузов', en: 'Body' },
  'Սալոն': { hy: 'Սալոն', ru: 'Салон', en: 'Interior' },
  'Քիմմաքրում': { hy: 'Քիմմաքրում', ru: 'Химчистка', en: 'Deep clean' },
  'Փայլեցում': { hy: 'Փայլեցում', ru: 'Полировка', en: 'Polish' },

  /* Стоматология */
  'Զննում': { hy: 'Զննում', ru: 'Осмотр', en: 'Checkup' },
  'Մաքրում': { hy: 'Մաքրում', ru: 'Чистка', en: 'Cleaning' },
  'Պլոմբ': { hy: 'Պլոմբ', ru: 'Пломба', en: 'Filling' },
  'Հեռացում': { hy: 'Հեռացում', ru: 'Удаление', en: 'Extraction' },
  'Իմպլանտ': { hy: 'Իմպլանտ', ru: 'Имплант', en: 'Implant' },

  /* Автосервис */
  'Յուղի փոխարինում': { hy: 'Յուղի փոխարինում', ru: 'Замена масла', en: 'Oil change' },
  'Ախտորոշում': { hy: 'Ախտորոշում', ru: 'Диагностика', en: 'Diagnostics' },
  'Արգելակներ': { hy: 'Արգելակներ', ru: 'Тормоза', en: 'Brakes' },
  'Կախոց': { hy: 'Կախոց', ru: 'Подвеска', en: 'Suspension' },
  'Անվադողերի փոխարինում': { hy: 'Անվադողերի փոխարինում', ru: 'Шиномонтаж', en: 'Tire change' },

  /* Барбершоп */
  'Սանրվածք': { hy: 'Սանրվածք', ru: 'Стрижка', en: 'Haircut' },
  'Մորուք': { hy: 'Մորուք', ru: 'Борода', en: 'Beard' },
  'Մանկական': { hy: 'Մանկական', ru: 'Детская', en: 'Kids' },
  'Սափրում': { hy: 'Սափրում', ru: 'Бритьё', en: 'Shave' },

  /* Клининг */
  'Բնակարան': { hy: 'Բնակարան', ru: 'Квартира', en: 'Apartment' },
  'Գրասենյակ': { hy: 'Գրասենյակ', ru: 'Офис', en: 'Office' },
  'Գլխավոր մաքրում': { hy: 'Գլխավոր մաքրում', ru: 'Генеральная уборка', en: 'Deep cleaning' },
  'Վերանորոգումից հետո': { hy: 'Վերանորոգումից հետո', ru: 'После ремонта', en: 'After renovation' },
  'Պատուհաններ': { hy: 'Պատուհաններ', ru: 'Окна', en: 'Windows' },

  /* Ветклиника */
  'Ընդունելություն': { hy: 'Ընդունելություն', ru: 'Приём', en: 'Visit' },
  'Պատվաստում': { hy: 'Պատվաստում', ru: 'Вакцинация', en: 'Vaccination' },
  'Ուլտրաձայն': { hy: 'Ուլտրաձայն', ru: 'УЗИ', en: 'Ultrasound' },
  'Ստերիլիզացիա': { hy: 'Ստերիլիզացիա', ru: 'Стерилизация', en: 'Spaying' },
  'Խուզում': { hy: 'Խուզում', ru: 'Груминг', en: 'Grooming' },
};

/**
 * Обратный указатель: любая известная форма слова → заводской ключ.
 *
 * Нужен из-за порядка работы. Термины тенанта переводятся один раз, у
 * входа на страницу (`localizeTenant`), и дальше по всему дереву едет уже
 * «машина», а не «մեքենա». Когда ниже кто-то ставит рядом число, слово
 * надо просклонять — но искать его в таблице уже не по чему: ключи там
 * армянские.
 *
 * Поэтому таблица читается в обе стороны. Заодно это чинит и обратный
 * случай: слово, пришедшее из базы уже переведённым (например, бизнес
 * заведён с русским интерфейсом), всё равно находит свои формы.
 */
function reverseIndex(table: Record<string, Record<Locale, Forms>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, byLocale] of Object.entries(table)) {
    out[key] = key;
    for (const f of Object.values(byLocale)) {
      for (const form of [f.nom, f.acc, f.many]) out[form] ??= key;
    }
  }
  return out;
}

const UNIT_KEYS = reverseIndex(UNITS);

/** То же самое для таблиц без падежей: слово любого языка → ключ. */
function plainKeys(table: Record<string, Record<Locale, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, byLocale] of Object.entries(table)) {
    out[key] = key;
    for (const word of Object.values(byLocale)) out[word] ??= key;
  }
  return out;
}

const STAFF_KEYS = plainKeys(STAFF_ROLES);

/* Услугу владелец правит руками: открыл прайс на русском, поменял цену и
   сохранил — в базу ушло «Комплекс». Обратный указатель узнаёт её и в
   этом виде, поэтому армянский экран после такой правки не остаётся с
   русским словом. */
const SERVICE_KEYS = plainKeys(SERVICE_NAMES);

/**
 * Язык приходит строкой отовсюду: из словаря (`t.locale`), из куки, из
 * заголовка приложения. Приводим к своему набору здесь, один раз, чтобы
 * ни один вызывающий не занимался этим сам.
 */
function asLocale(locale: string): Locale {
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

function pick(
  table: Record<string, Record<Locale, string>>,
  value: string,
  locale: string,
  keys?: Record<string, string>,
): string {
  const raw = value.trim();
  return table[keys?.[raw] ?? raw]?.[asLocale(locale)] ?? value;
}

/**
 * Единица учёта во всех нужных формах.
 *
 * Слово владельца («тачка», «кузов») проходит насквозь: перевода у него
 * нет и быть не может, а падеж чужого слова не угадать — поэтому во всех
 * трёх формах стоит оно само, а «с одной» строится общей рамкой языка.
 */
export function unitForms(unitOne: string, locale: string): Forms {
  const key = UNIT_KEYS[unitOne.trim()] ?? unitOne.trim();
  const known = UNITS[key]?.[asLocale(locale)];
  if (known) return known;

  const own = unitOne.trim();
  const fallbackFromOne: Record<Locale, string> = {
    /* Армянский отделительный строится правилом: после гласной `-յից`,
       после согласной `-ից`. Оно верно для любого армянского слова, в
       том числе придуманного владельцем. */
    hy: `մեկ ${own}${'աեէըիոօու'.includes(own.slice(-1)) ? 'յից' : 'ից'}`,
    /* В русском падеж чужого слова не построить, поэтому рамка обходится
       без него: «на 1 тачка» было бы хуже, чем «на единицу». */
    ru: `на 1 ${own}`,
    en: `per 1 ${own}`,
  };

  /* Слово владельца: во всех формах оно само. Склонять чужое слово
     нельзя — «5 тачкы» хуже, чем «5 тачка», а придумывать за человека
     множественное число мы права не имеем. */
  return forms(own, own, own, fallbackFromOne[asLocale(locale)], () => own);
}

/**
 * «3 машины» — счёт в единицах учёта бизнеса.
 *
 * Единственный правильный способ поставить число рядом с этим словом.
 * Склейка `${n} ${tenant.unitOne}` давала по-русски «0 машина», и это
 * читалось опечаткой, а не нулём.
 */
export function unitCount(n: number, unitOne: string, locale: string): string {
  return unitForms(unitOne, locale).count(n);
}

/** Слово под числом плитки: «6» крупно, «машин» мелко под ним. */
export function unitWord(n: number, unitOne: string, locale: string): string {
  return unitForms(unitOne, locale).word(n);
}

/** «3 мойщика» — счёт людей, а не подпись столбца. */
export function staffCount(n: number, staffRole: string, locale: string): string {
  const key = STAFF_KEYS[staffRole.trim()] ?? staffRole.trim();
  const known = STAFF_COUNTS[key]?.[asLocale(locale)];
  return known ? known(n) : `${n} ${staffRole.toLocaleLowerCase(intlTag(locale))}`;
}

/** Языковой тег для `toLocaleLowerCase`: регистр у языков свой. */
function intlTag(locale: string): string {
  return { hy: 'hy-AM', ru: 'ru-RU', en: 'en-US' }[asLocale(locale)];
}

/** «с одной машины» — подпись под средним значением на сводке. */
export function fromOneUnit(unitOne: string, locale: string = DEFAULT_LOCALE): string {
  return unitForms(unitOne, locale).fromOne;
}

export function staffRoleTerm(value: string, locale: string): string {
  return pick(STAFF_ROLES, value, locale, STAFF_KEYS);
}

export function staffRolePluralTerm(value: string, locale: string): string {
  return pick(STAFF_PLURAL, value, locale);
}

export function clientIdLabelTerm(value: string, locale: string): string {
  return pick(CLIENT_ID_LABELS, value, locale);
}

export function nicheNameTerm(value: string, locale: string): string {
  return pick(NICHE_NAMES, value, locale);
}

export function nicheTagTerm(value: string, locale: string): string {
  return pick(NICHE_TAGS, value, locale);
}

export function addLabelTerm(value: string, locale: string): string {
  return pick(ADD_LABELS, value, locale);
}

/**
 * Разделитель составной записи. Тот же, каким `lib/orders.ts` склеивает
 * снимок названия в заказе: «Կոմպլեքս + Թափք».
 */
const SERVICE_JOIN = ' + ';

/**
 * Название услуги на языке того, кто смотрит.
 *
 * Переводится только заводское; «Мойка дисков», придуманная владельцем,
 * проходит насквозь. Составное название разбирается по частям: в снимке
 * заказа их две, и одна может быть нашей, а вторая его.
 */
export function serviceNameTerm(value: string, locale: string): string {
  if (!value.includes(SERVICE_JOIN)) return pick(SERVICE_NAMES, value, locale, SERVICE_KEYS);
  return value
    .split(SERVICE_JOIN)
    .map((part) => pick(SERVICE_NAMES, part, locale, SERVICE_KEYS))
    .join(SERVICE_JOIN);
}

/**
 * Термины бизнеса на языке того, кто сейчас смотрит.
 *
 * Возвращает копию: строки тенанта в этом объекте дальше едут ТОЛЬКО на
 * экран. Ничего, что пишется обратно в базу, здесь не трогается — иначе
 * русский интерфейс переписал бы владельцу его же настройки.
 */
export function localizeTenant<
  T extends { unitOne: string; staffRole: string; clientIdLabel: string },
>(tenant: T, locale: string): T {
  return {
    ...tenant,
    unitOne: unitForms(tenant.unitOne, locale).nom,
    staffRole: staffRoleTerm(tenant.staffRole, locale),
    clientIdLabel: clientIdLabelTerm(tenant.clientIdLabel, locale),
  };
}

/** То же самое, но терпит `null` — так тенант приходит из `getTenant`. */
export function localizeTenantOrNull<
  T extends { unitOne: string; staffRole: string; clientIdLabel: string },
>(tenant: T | null, locale: string): T | null {
  return tenant ? localizeTenant(tenant, locale) : null;
}
