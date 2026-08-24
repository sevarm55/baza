import type { Dict } from '@/lib/i18n';

/**
 * Форма данных экрана записи — одна на оба представления.
 *
 * Композиция телефона и композиция компьютера разные, а данные и правила
 * общие: цена по классу, доля команды, очередь без связи. Типы живут
 * здесь, чтобы «два представления» не превратились в «два продукта».
 */

/**
 * Коллега в списке «помыли вместе».
 *
 * `onShift` решает, показывать его вообще: отметить участником можно
 * только того, кто встал на смену. Признак, а не готовый отфильтрованный
 * список: «коллег нет вовсе» и «все ушли домой» разные ответы, и форма
 * обязана их различать.
 */
export type Mate = { id: string; name: string; onShift: boolean };

export type Service = {
  id: string;
  name: string;
  /** базовая цена: класс не выбран или у него своей цены нет */
  price: number;
  /** цена по каждому классу, в порядке `tiers`; считает сервер */
  prices: number[];
};

export type Recent = {
  id: string;
  clientKey: string | null;
  serviceName: string;
  price: number;
  payment: string;
  at: string;
  /** сколько причитается смотрящему за эту машину */
  earned: number;
  /** сколько человек её мыли; 1 обычная одиночная мойка */
  crew: number;
  /**
   * Запись сделал смотрящий. От этого зависит, показывать ли отмену:
   * чужую совместную мойку человек видит, но отменять её не вправе, и
   * кнопка, которая всегда отвечает отказом, хуже отсутствующей.
   */
  mine: boolean;
};

export type ActivePass = {
  id: string;
  serviceId: string | null;
  serviceName: string;
  remaining: number;
};

export type Known = {
  visits: number;
  total: number;
  lastSeenAt: string;
  /** каким классом эту машину записывали в прошлый раз */
  lastTier: string | null;
  passes: ActivePass[];
};

/**
 * Что на экране.
 *
 * Номер, услуга и оплата стоят на одном экране в том порядке, в каком
 * идёт работа. Оплата это выбор, а не отправка: последнее движение
 * отдельная кнопка, и на ней стоит то, что произойдёт, и за сколько.
 *
 * ПОСЛЕ ЗАПИСИ ФОРМА ЗАКРЫВАЕТСЯ. Подтверждение, которому верят, это
 * машина в журнале и выросший счётчик; они на общем экране, туда и
 * возвращаемся. Следующая машина начинается с той же большой кнопки.
 */
export type Step = 'home' | 'compose';

export type OrderFlowProps = {
  canWrite: boolean;
  services: Service[];
  /** классы машин бизнеса; пусто: ряда нет */
  tiers: string[];
  /** как бизнес называет класс: «Դաս», «Тип кузова» */
  tierLabel: string;
  currency: string;
  clientIdLabel: string;
  clientIdType: string;
  /** «մեքենա»: ниша называет единицу учёта сама */
  unitOne: string;
  addLabel: string;
  recent: Recent[];
  /* Часовой пояс мойки приходит пропом, а не берётся из браузера: иначе
     время записи меняется на глазах при гидратации. */
  timezone: string;
  /** смена открыта: пусто здесь означает разное до неё и внутри неё */
  shiftOpen: boolean;
  /** коллеги без себя, с признаком «на смене» */
  mates: Mate[];
  /** общий процент команды; null: выбора «кто мыл» нет вовсе */
  teamPercent: number | null;
  /** «мойщик»: слово ниши, им считаем людей */
  staffRole: string;
  /** сценарий первого запуска: тихое кольцо на кнопке записи */
  highlightAdd?: boolean;
  /** экран без полосы вкладок (мойщик): запись живёт кнопкой внизу */
  solo?: boolean;
  /** пришли по «+» из полосы вкладок: форма открывается сразу */
  autoOpen?: boolean;
};

export function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

/**
 * «вчера», «3 дня назад» — как давно машина была здесь в прошлый раз.
 *
 * Считается в браузере от «сейчас»: сервер собрал страницу когда-то, а
 * читают её позже, и «сегодня» на разложенной с ночи странице соврало бы.
 */
export function agoLabel(iso: string, t: Dict): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(days);
}
