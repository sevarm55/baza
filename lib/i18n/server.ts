import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, pickAuthLocale, type AuthLocale } from './auth';

/**
 * Язык окна входа на сервере.
 *
 * Считается здесь, а не в браузере, по одной причине: первый экран
 * должен приехать уже на нужном языке. Определи мы язык после гидрации —
 * человек увидел бы армянскую форму, которая через миг стала русской, и
 * это выглядит как ошибка, а не как забота.
 */
export async function currentAuthLocale(): Promise<AuthLocale> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return pickAuthLocale({
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get('accept-language'),
  });
}
