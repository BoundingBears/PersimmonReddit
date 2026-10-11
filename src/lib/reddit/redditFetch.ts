// JS handle for the native RedditFetch plugin (android/.../RedditFetchPlugin.java).
// It runs a same-origin fetch() inside a hidden WebView parked on reddit.com,
// which is the only request shape Reddit's edge currently accepts from the app
// (the native okhttp client is TLS-fingerprint-blocked; a cross-origin WebView
// fetch is CORS-rejected). Android-only; unimplemented on web (we never call it
// there — the plain `fetch` path works in a desktop browser).

import { registerPlugin } from '@capacitor/core';

export interface RedditFetchPlugin {
	// One-time cookie warm-up (navigate a WebView to reddit.com) so plain okhttp
	// requests are accepted afterward. Resolves when the cookie jar is populated.
	// `force` re-runs it even though cookies exist, for when requests start
	// coming back blocked mid-session (cookies lapsed, or a fresh JS challenge).
	warmup(options?: { force?: boolean }): Promise<void>;
	// Real WebView navigation to a URL, returning the rendered body — the
	// self-healing fallback when okhttp is blocked (cookies lapsed).
	// `url` is where the navigation ended up after any redirects.
	get(options: { url: string }): Promise<{ status: number; body: string; url?: string }>;
}

export const RedditFetch = registerPlugin<RedditFetchPlugin>('RedditFetch');
