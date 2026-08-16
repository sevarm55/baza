'use client';

import { useSyncExternalStore } from 'react';

/**
 * Тема — одно состояние на весь продукт.
 *
 * Переключателей у неё три: значок в шапке телефона, строка в меню
 * пользователя и ряд в настройках интерфейса. Каждый из них раньше читал
 * тему по-своему — кто через `useState` в эффекте, кто напрямую из
 * `dataset`, — и переключение в одном месте не доходило до двух других:
 * человек менял тему в меню, а значок в шапке продолжал предлагать то,
 * что уже включено.
 *
 * Хранилище здесь настоящее — сам документ. `data-theme` на `<html>`
 * ставит скрипт в `<head>` ещё до первой отрисовки (см. `theme-script`),
 * поэтому вопрос «какая тема сейчас» имеет ответ всегда, и второе
 * состояние в React ему только противоречило бы. О смене узнают через
 * своё событие: `MutationObserver` на атрибут стоил бы дороже и ловил бы
 * чужие правки атрибута заодно.
 */
export type Theme = 'light' | 'dark';

const THEME_EVENT = 'tetrin:theme-change';
const THEME_KEY = 'bazis.theme';

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function read(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/* На сервере темы нет: разметка отдаётся одна на обе, а настоящую
   ставит скрипт в `<head>` до первого кадра. Тёмная как ответ сервера —
   то же значение, что по умолчанию у `read()`, иначе первый клиентский
   кадр расходился бы с серверным. */
function readOnServer(): Theme {
  return 'dark';
}

/** Тема, которая стоит сейчас. Перерисовывает всех, кто её спросил. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

/**
 * Поставить тему.
 *
 * Не хук: вызывается из обработчика и должен работать одинаково из
 * любого места, включая те, где React уже не участвует.
 */
export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Приватный режим отказывает в хранилище: текущая сессия всё равно меняется.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
