import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /** Сборка в самодостаточный server.js — образ выходит десятки мегабайт вместо сотен. */
  output: 'standalone',

  /**
   * PGlite тащит с собой .wasm и .data файлы и грузит их через fs.
   * Внутри бандла Turbopack путь приезжает как URL из чужого realm,
   * и Node отвергает его с ERR_INVALID_ARG_TYPE. Оставляем пакет
   * внешним — он всё равно только серверный.
   */
  serverExternalPackages: ['@electric-sql/pglite'],

  /**
   * Откуда разрешено вызывать серверные действия.
   *
   * Server Action — это открытый POST, и Next сверяет `Origin` с хостом
   * сам. Список нужен там, где хост «снаружи» не совпадает с хостом
   * «изнутри»: за обратным прокси, на своём домене, в staging. Пусто —
   * значит совпадает, и это правильное умолчание.
   */
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^https?:\/\//, ''))
        .filter(Boolean),
      /* Тело действия — это форма из четырёх полей. Мегабайт по
         умолчанию здесь избыточен: чем меньше принимаем, тем меньше
         стоит попытка завалить сервер разбором мусора. */
      bodySizeLimit: '256kb',
    },
  },

  /**
   * Заголовки, которые не зависят от запроса.
   *
   * Всё, что зависит — CSP с одноразовым ключом, HSTS по протоколу, —
   * ставит `proxy.ts`: там есть запрос, здесь его нет. Тут остаётся
   * только то, чему всё равно.
   */
  async headers() {
    return [
      {
        /* Статику proxy не трогает (она исключена матчером), но
           заголовок «не угадывай тип» нужен и ей: подсунутый под видом
           картинки скрипт опасен именно там, где его никто не ждёт. */
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
