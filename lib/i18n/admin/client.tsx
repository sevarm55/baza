'use client';

import { useLocale } from '../client';
import { adminDict, type AdminDict } from './index';

/** Словарь админки в клиентских компонентах: язык из общего провайдера. */
export function useA(): AdminDict {
  return adminDict(useLocale());
}
