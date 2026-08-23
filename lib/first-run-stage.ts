/**
 * Позиция в сценарии первого запуска.
 *
 * Чистые константы без базы и сервера: их импортируют и регистрация
 * (lib/tenant.ts), и серверная логика сценария (lib/first-run.ts).
 *
 * Значение — ПОСЛЕДНИЙ ПРОЙДЕННЫЙ РУБЕЖ, а не следующий шаг: «services»
 * значит «услуги подтверждены», и сценарий продолжается с расхода.
 * Хранить пройденное, а не будущее, проще сверять с данными: рубеж либо
 * подтверждён данными бизнеса, либо нет.
 *
 * Порядок строгий и движется только вперёд (см. setStage в
 * lib/first-run.ts): «назад» в сценарии не бывает, потому что назад не
 * бывает у данных — добавленная услуга не исчезает от перезагрузки.
 */
export const FIRST_RUN_STAGES = [
  /** аккаунт создан, ни один шаг не пройден */
  'new',
  /** услуги и цены подтверждены */
  'services',
  /** первый расход добавлен */
  'expense',
  /** первый работник заведён */
  'staff',
  /** владелец вошёл в режим работника */
  'preview',
  /** первая машина записана работником */
  'car',
  /** сценарий закрыт; больше не показывается никогда */
  'done',
] as const;

export type FirstRunStage = (typeof FIRST_RUN_STAGES)[number];

export const FIRST_RUN_START: FirstRunStage = 'new';

/** Позиция рубежа в порядке сценария; неизвестное слово — как NULL. */
export function stageIndex(stage: string | null): number {
  return FIRST_RUN_STAGES.indexOf(stage as FirstRunStage);
}

/** Рубеж `a` достигнут, если он не раньше `b`. */
export function stageAtLeast(a: string | null, b: FirstRunStage): boolean {
  const i = stageIndex(a);
  return i >= 0 && i >= stageIndex(b);
}

/**
 * Идёт ли у участия сценарий первого запуска.
 *
 * NULL — сценарий неприменим (существующие участия, работники, вторые
 * точки), 'done' — пройден. И то и другое означает обычный кабинет.
 */
export function firstRunActive(stage: string | null): boolean {
  return stageIndex(stage) >= 0 && stage !== 'done';
}
