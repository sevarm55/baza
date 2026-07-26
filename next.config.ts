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
};

export default nextConfig;
