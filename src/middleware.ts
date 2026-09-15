import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocalePath } from '@/i18n/locale-path';

/**
 * EN is served at the site root; FR lives under /fr. `/en/*` redirects to the canonical
 * unprefixed URL; everything else is rewritten into the /en tree that app/[locale] renders.
 */
export function middleware(request: NextRequest) {
	const route = resolveLocalePath(request.nextUrl.pathname);
	if (route.kind === 'next') return NextResponse.next();
	const url = request.nextUrl.clone();
	url.pathname = route.pathname;
	return route.kind === 'redirect' ? NextResponse.redirect(url, 308) : NextResponse.rewrite(url);
}

export const config = {
	// Skip API routes, the dev subgraph proxy (next.config.js rewrites), Next internals, and files.
	matcher: ['/((?!api|subgraphs|_next|.*\\..*).*)'],
};
