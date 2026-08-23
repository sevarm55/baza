import { NextResponse, type NextRequest } from 'next/server';
import { THEME_SCRIPT_HASH } from '@/lib/theme-script';
import { env } from '@/lib/env';

/**
 * В Next 16 middleware переименован в proxy и работает на Node-рантайме.
 *
 * Здесь три вещи, и ни одна из них не решает, кто вы:
 *
 *   1. навигация — не тащить гостя на защищённый экран, чтобы он там
 *      увидел редирект;
 *   2. заголовки безопасности, включая CSP с одноразовым ключом;
 *   3. проверка источника для запросов, которые что-то меняют.
 *
 * НАСТОЯЩАЯ проверка прав живёт в `requireSession()` внутри каждой
 * страницы и каждого действия, а для API — в `lib/api/guard.ts`. Cookie
 * здесь даже не расшифровывается: proxy можно обойти, страницу — нет.
 */

/* --------------------------- источники --------------------------- */

/**
 * Кому разрешено ходить к нам из браузера.
 *
 * Продакшен задаётся переменной, локальная разработка добавляется сама.
 * Списка «разрешить всем» не существует и не появится: API отвечает по
 * токену, и `Access-Control-Allow-Origin: *` вместе с ним означал бы,
 * что любой сайт читает данные мойки в браузере её владельца.
 */
function allowedOrigins(): string[] {
  const configured = (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const site = env('PUBLIC_ORIGIN');
  if (site) configured.push(site);

  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:3000', 'http://localhost:3100', 'http://127.0.0.1:3000');
  }

  return configured;
}

/**
 * Совпадает ли источник запроса с тем, куда он пришёл.
 *
 * Главная защита — не список, а сравнение `Origin` с собственным хостом:
 * так проверка работает на любом домене, включая тот, о котором забыли
 * написать в переменной. Список нужен только для явно разрешённых
 * чужих origin.
 *
 * `Origin` в современных браузерах присутствует на всех запросах,
 * меняющих состояние. Его отсутствие — это либо не браузер (приложение,
 * curl, наш же cron), либо навигация; и то и другое здесь не опасно,
 * потому что подделать cookie-запрос из чужой вкладки без Origin нельзя.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      return false;
    }
  }

  return allowedOrigins().includes(origin);
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* ------------------------------ CSP ------------------------------ */

/**
 * Политика содержимого.
 *
 * `script-src` строгий: одноразовый ключ и `strict-dynamic`, никакого
 * `unsafe-inline`. Именно сюда приземляется XSS, и именно здесь послабления
 * стоят дороже всего.
 *
 * `style-src` с `unsafe-inline` — и это не лень, а честное описание того,
 * что в продукте есть. Кабинет расставляет цвета людей и высоты полос
 * через `style={{…}}`; это атрибуты, а не теги, и одноразовый ключ на них
 * не действует в принципе — их разрешает только `style-src-attr`.
 * Написать строгий `style-src` и оставить приложение без цветов было бы
 * не безопасностью, а поломкой. Стилевой XSS без скриптов ограничен
 * оформлением.
 *
 * `frame-ancestors 'none'` — то, ради чего это в первую очередь писалось:
 * ни лендинг, ни кабинет не должны открываться в чужом iframe.
 */
function policy(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development';

  /* В разработке политика мягче, и это осознанно.

     Строгий `script-src` со `strict-dynamic` отменяет `'self'`, а
     клиент горячей перезагрузки Turbopack приезжает тегом без ключа —
     Next его не помечает. Под строгой политикой он блокируется, а
     вместе с ним ломается гидратация: страница отрисована, но ни одна
     кнопка не работает. Ловить это каждый раз заново дороже, чем
     признать, что своя машина разработчика — не модель угроз.

     В production политика строгая, и именно она уезжает к людям. */
  /* Хеш скрипта темы стоит рядом с ключом. Ключ ему не подходит:
     React не восстанавливает атрибут `nonce` при гидратации, и она
     обрывается — см. lib/theme-script.ts.

     В разработке хеша НЕТ, и это не небрежность, а правило CSP:
     `'unsafe-inline'` игнорируется, как только в списке появляется хоть
     один хеш или ключ. Оставь мы хеш рядом с `'unsafe-inline'` —
     заблокировались бы все встроенные скрипты Next, страница
     отрисовалась бы и осталась картинкой, а в консоли лежала бы одна
     строчка, связать которую с «кнопки не нажимаются» получается
     далеко не сразу. Проверено на себе. */
  const script = dev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' ${THEME_SCRIPT_HASH} 'strict-dynamic'`;

  return [
    `default-src 'self'`,
    script,
    `style-src 'self' 'unsafe-inline'`,
    `style-src-attr 'unsafe-inline'`,
    // data: — иконки в manifest, blob: — выгрузка CSV
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `media-src 'self'`,
    /* Странице ходить наружу неоткуда: своё же API и всё. В разработке
       к этому добавляется сокет горячей перезагрузки, и адрес у него
       свой на каждой машине — от `localhost` до адреса в сети, если
       открывают с телефона. Перечислять их бессмысленно. */
    `connect-src ${dev ? "'self' ws: wss: http: https:" : "'self'"}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `worker-src 'self'`,
    // manifest.webmanifest и service worker живут у нас же
    `manifest-src 'self'`,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * Заголовки, которые ставятся на всё.
 *
 * HSTS только в production и только по HTTPS: выставить его с локальной
 * машины значит запереть себе браузер на `http://localhost` до истечения
 * срока, и «почему у меня не открывается» будет длиться неделю.
 */
function harden(response: NextResponse, request: NextRequest): NextResponse {
  const h = response.headers;

  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  /* Дублирует frame-ancestors для браузеров, которые CSP ещё не
     понимают. Стоит копейки, снимает целый класс кликджекинга. */
  h.set('X-Frame-Options', 'DENY');
  h.set('X-DNS-Prefetch-Control', 'off');
  /* Продукт не просит ни камеру, ни микрофон, ни геопозицию. Сканер
     номеров живёт в приложении, а не в браузере. */
  h.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  const https =
    request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';

  if (process.env.NODE_ENV === 'production' && https) {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

/* ---------------------------- маршрут ---------------------------- */

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* Запрос, меняющий состояние, из чужого источника не выполняется.
     Server Actions в Next сверяют Origin сами, но под этой проверкой
     оказываются и обычные маршруты — например удаление бизнеса, которое
     приходит формой и авторизуется cookie. Отдельный слой здесь дешевле
     обещания не забыть. */
  if (MUTATING.has(request.method) && !sameOrigin(request)) {
    return harden(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
      request,
    );
  }

  /* API отвечает по токену из заголовка, а не по cookie, поэтому CORS
     ему не нужен вовсе: без заголовков ответ чужому origin браузер не
     отдаст. Явно разрешаем только то, что в списке. */
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const response = NextResponse.next();

    if (origin && allowedOrigins().includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
      response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      response.headers.set('Access-Control-Max-Age', '600');
    }

    return harden(response, request);
  }

  if (isPrivate(pathname) && !request.cookies.has('bz_session')) {
    /* На витрину с уже открытым окном, а не на `/login`: отдельной
       страницы входа больше нет, и её адрес всё равно привёл бы сюда —
       только через лишний перезаход. */
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '?auth=signIn';
    return harden(NextResponse.redirect(url), request);
  }

  /* Одноразовый ключ приходит и в заголовке ответа, и в заголовках
     запроса: Next читает его из `Content-Security-Policy` на запросе и
     сам расставляет по своим скриптам. Руками ставить его никуда не
     нужно. */
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = policy(nonce);

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);

  return harden(response, request);
}

function isPrivate(pathname: string): boolean {
  return (
    pathname.startsWith('/work') ||
    pathname.startsWith('/owner') ||
    pathname.startsWith('/onboarding')
  );
}

export const config = {
  /* Всё, кроме служебного `_next` и статики: заголовки безопасности
     нужны на странице, а не на шрифте.

     `_next` исключён целиком, а не только `static` и `image`. Там же
     живёт сокет горячей перезагрузки, а proxy на запросе апгрейда
     соединения его ломает: заголовки подменяются, апгрейд не
     происходит, и дальше разработчик смотрит на страницу, которая
     не обновляется, и не понимает почему.

     Префетчи `next/link` исключены отдельно — им CSP не нужен, а
     одноразовый ключ на них только ломает кеш. */
  matcher: [
    {
      source: '/((?!_next|favicon.ico|icon-|apple-icon|sw.js).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
