import { ArrowLeftRight, Banknote, CreditCard } from 'lucide-react';

import type { Payment } from '@/lib/orders';

/**
 * Способы оплаты и их знаки — один список на оба представления.
 *
 * Порядок не случайный и не алфавитный: наличные первыми, потому что на
 * мойке ими платят чаще всего, и попадать в первую плитку пальцем
 * приходится сорок раз за смену.
 *
 * Подписи здесь нет: она приходит из словаря по ключу, и держать её
 * рядом со знаком значило бы завести второй перевод одного слова.
 */
export const PAYMENTS: { key: Exclude<Payment, 'pass'>; Icon: typeof Banknote }[] = [
  { key: 'cash', Icon: Banknote },
  { key: 'card', Icon: CreditCard },
  { key: 'transfer', Icon: ArrowLeftRight },
];
