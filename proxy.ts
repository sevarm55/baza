import { NextResponse, type NextRequest } from 'next/server';

/**
 * В Next 16 middleware переименован в proxy и работает на Node-рантайме.
 *
 * Здесь ТОЛЬКО удобство навигации: не тащить гостя на защищённый экран,
 * чтобы он там увидел редирект. Настоящая проверка прав живёт в
 * requireSession() внутри каждой страницы и каждого действия — cookie
 * тут даже не расшифровывается.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('bz_session')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/work/:path*', '/owner/:path*'],
};
