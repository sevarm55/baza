/**
 * Единое имя клиента для записи, поиска, абонемента и истории.
 *
 * Армянский номер машины люди набирают как `77GG477`, `77 GG 477` или
 * `77-GG-477`. Это один автомобиль. Храним красивую форму с пробелами,
 * но распознаём все три. Остальные идентификаторы (например, телефон)
 * не переписываем, кроме регистра и повторных пробелов.
 */
export function normalizeClientKey(raw: string): string {
  const readable = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = readable.replace(/[\s-]+/g, '');

  if (/^\d{2}[A-Z]{2}\d{3}$/.test(compact)) {
    return `${compact.slice(0, 2)} ${compact.slice(2, 4)} ${compact.slice(4)}`;
  }

  return readable;
}
