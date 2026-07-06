// HTTP wrapper around Reddit's public JSON endpoints.
//
// Why this layer exists (vs Geddit's plain fetch):
//   1. User-Agent: Reddit's edge (snooserv) hard-403s requests whose UA looks
//      automated — anything containing "bot"/"scraper"/"crawler", a default
//      library UA (okhttp/…), or an empty UA. We learned this the hard way: the
//      old UA literally contained the word "scraper" and got blocked on-device.
//      The unauthenticated .json endpoints answer a believable *browser* UA, so
//      we send one. (On web, fetch() can't override the UA anyway, and the real
//      browser UA already works via CORS — so this only affects native.)
//   2. Referer: preview.redd.it / i.redd.it require Referer=reddit.com to
//      hot-link images. (Set per-image in the UI; we set it here for JSON too.)
//   3. Transport: JSON GETs go through the WebView's own fetch (real browser
//      identity) and fall back to CapacitorHttp/okhttp only if that's CORS-
//      rejected. okhttp gets fingerprinted and 403'd by Reddit regardless of
//      the UA we set; the WebView fetch is accepted. (POSTs use CapacitorHttp.)
//   4. 429 backoff with Retry-After.
//   5. 403 / 503 fallback to old.reddit.com (sometimes more permissive). When
//      Reddit blocks us it serves a text/html interstitial instead of JSON; we
//      detect that so the error says "blocked" rather than a bare status code.
//   6. In-memory dedupe cache (60s) to avoid re-hitting Reddit when the user
//      navigates back and forth.
//   7. Typed Result<T> instead of swallowing errors with `.catch(() => null)`.

import { CapacitorHttp } from '@capacitor/core';
import { get } from 'svelte/store';
import { IS_NATIVE } from '$lib/utils/platform';
import { pushToast } from '$lib/stores/toast';
import { prefs } from '$lib/stores/prefs';
import { feedCache } from '$lib/stores/feedCache';
import { RedditFetch } from './redditFetch';
import type { Result } from './types';

// User-Agent escalation ladder. Reddit's edge sometimes blocks one believable
// browser UA but not another (it varies by IP reputation + UA). We start with a
// mobile-Chrome UA and, *only when a request comes back blocked*, escalate to
// the next identity. None need to match the real device — Reddit just checks
// that the UA looks like a browser, not a bot. (UA only matters on native; web
// fetch can't set it and doesn't need to.)
const UA_LADDER = [
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
];
const HOST_PRIMARY = 'https://www.reddit.com';
const HOST_FALLBACK = 'https://old.reddit.com';
const CACHE_TTL_MS = 60_000;
const MAX_ATTEMPTS = 3;
// Hard transport deadlines. Without these, CapacitorHttp/okhttp inherits
// HttpURLConnection's default of 0 = wait forever, so a Reddit edge that
// throttles by *stalling* the socket (rather than returning a status) wedges a
// load-more request permanently — the `loading` flag never clears and every
// recovery path is gated behind it. Bounding every request means a hung socket
// fails, gets retried/surfaced, and the spinner always resolves.
const CONNECT_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 20_000; // resets on each chunk received
// Cap on how long we'll obey a 429 Retry-After before giving up the attempt.
// Reddit occasionally returns Retry-After: 300 (5 min), which is
// indistinguishable from a freeze; better to fail the attempt and let the
// user's retry button take over.
const MAX_RATE_LIMIT_WAIT_MS = 15_000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

function buildUrl(host: string, path: string, params?: Record<string, string | number | boolean>): string {
	const url = new URL(path.startsWith('/') ? path : `/${path}`, host);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined || v === null) continue;
			url.searchParams.set(k, String(v));
		}
	}
	// Reddit returns the .json variant only when the path ends in .json. Leave
	// path-shaping to the caller; this just stitches URLs.
	return url.toString();
}

function cacheKey(method: string, url: string, body?: unknown): string {
	return body ? `${method} ${url} ${JSON.stringify(body)}` : `${method} ${url}`;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// When Reddit blocks a request it returns its web "blocked" page — a big
// text/html document — instead of JSON. Detect that so we can report "blocked"
// (a UA / IP-reputation problem the user can act on) rather than a bare 403.
function looksBlocked(res: RawResponse): boolean {
	const ct = (res.headers['content-type'] ?? res.headers['Content-Type'] ?? '').toLowerCase();
	if (ct.includes('text/html')) return true;
	if (typeof res.data === 'string' && /<\s*(!doctype|html)\b/i.test(res.data)) return true;
	return false;
}

interface RawResponse {
	status: number;
	data: unknown;
	headers: Record<string, string>;
}

// The WebView's own fetch. This is the PRIMARY transport on every platform: it
// carries the WebView's real browser identity (a genuine Chrome UA *and* TLS/
// HTTP2 fingerprint), which Reddit's edge accepts. The native CapacitorHttp
// (okhttp) request gets fingerprinted and 403'd no matter what User-Agent we
// set — which is why setting a "browser" UA on it wasn't enough. CapacitorHttp
// is NOT globally patched (see capacitor.config.ts), so this fetch really does
// go through the browser stack. It's cross-origin, but Reddit sends
// Access-Control-Allow-Origin:* on the public .json endpoints — the same reason
// `npm run dev` works in a desktop browser.
async function rawGetFetch(url: string): Promise<RawResponse> {
	const res = await fetch(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(READ_TIMEOUT_MS)
	});
	const text = await res.text();
	let parsed: unknown = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = text;
	}
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => {
		headers[k.toLowerCase()] = v;
	});
	return { status: res.status, data: parsed, headers };
}

// Native fallback via CapacitorHttp/okhttp. We mimic a real top-level browser
// *navigation* — the one request shape Reddit's WAF still lets through on the
// public .json endpoints — as closely as okhttp allows: a full browser Accept,
// the Sec-Fetch "navigate" set, client-hints, and crucially NO Origin and NO
// Referer (a fresh navigation sends neither; an Origin: https://localhost is a
// dead giveaway that this is a webview app). okhttp can set these headers freely
// (the browser forbids them on fetch, which is why fetch can't be disguised).
// If Reddit blocks on headers, this gets in; if it blocks on the okhttp TLS
// fingerprint, only a real WebView navigation would (tracked as a follow-up).
async function rawGetNative(url: string, ua: string): Promise<RawResponse> {
	const res = await CapacitorHttp.get({
		url,
		headers: {
			'User-Agent': ua,
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9',
			'Upgrade-Insecure-Requests': '1',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'none',
			'Sec-Fetch-User': '?1',
			'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
			'sec-ch-ua-mobile': '?1',
			'sec-ch-ua-platform': '"Android"'
		},
		connectTimeout: CONNECT_TIMEOUT_MS,
		readTimeout: READ_TIMEOUT_MS,
		responseType: 'json'
	});
	return { status: res.status, data: res.data, headers: res.headers ?? {} };
}

// Same-origin fetch through the native headless-WebView plugin (Android). This
// is the only transport Reddit's edge currently accepts from the app. The body
// comes back as text; we parse it here (no headers, so looksBlocked() falls
// back to sniffing the body for an HTML block page).
async function rawGetWebView(url: string): Promise<RawResponse> {
	const { status, body } = await RedditFetch.get({ url });
	let parsed: unknown = null;
	try {
		parsed = body ? JSON.parse(body) : null;
	} catch {
		parsed = body;
	}
	return { status, data: parsed, headers: {} };
}

function isBlocked(res: RawResponse): boolean {
	return res.status === 403 || res.status === 503 || looksBlocked(res);
}

// Warm Reddit's anonymous cookies once on device so the okhttp fast-path is
// accepted. Fire-and-forget at startup; the per-request fallback also warms.
let warmStarted = false;
export function warmupReddit(): void {
	if (!IS_NATIVE || warmStarted) return;
	warmStarted = true;
	RedditFetch.warmup().catch(() => {
		warmStarted = false;
	});
}

async function rawGet(url: string, ua: string = UA_LADDER[0]): Promise<RawResponse> {
	if (IS_NATIVE) {
		// Fast path: plain okhttp, which (once cookies are warm) Reddit accepts.
		try {
			const res = await rawGetNative(url, ua);
			if (!isBlocked(res)) return res;
		} catch {
			// fall through to the WebView navigation
		}
		// Self-healing fallback: a real WebView navigation. It warms the cookie
		// jar as a side effect, so subsequent okhttp requests start succeeding.
		try {
			return await rawGetWebView(url);
		} catch {
			return await rawGetNative(url, ua);
		}
	}
	// Web / dev: the WebView's own fetch works (Reddit allows the desktop browser
	// cross-origin read).
	return await rawGetFetch(url);
}

async function rawPost(
	url: string,
	body: Record<string, string>,
	ua: string = UA_LADDER[0]
): Promise<RawResponse> {
	if (IS_NATIVE) {
		const res = await CapacitorHttp.post({
			url,
			headers: {
				'User-Agent': ua,
				Referer: HOST_PRIMARY,
				Accept: 'application/json',
				'Accept-Language': 'en-US,en;q=0.9',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			data: body,
			connectTimeout: CONNECT_TIMEOUT_MS,
			readTimeout: READ_TIMEOUT_MS,
			responseType: 'json'
		});
		return { status: res.status, data: res.data, headers: res.headers ?? {} };
	}
	const params = new URLSearchParams(body);
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: params.toString(),
		signal: AbortSignal.timeout(READ_TIMEOUT_MS)
	});
	const text = await res.text();
	let parsed: unknown = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = text;
	}
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => {
		headers[k.toLowerCase()] = v;
	});
	return { status: res.status, data: parsed, headers };
}

async function withRetries(
	doRequest: (host: string, ua: string) => Promise<RawResponse>
): Promise<Result<unknown>> {
	let lastErr: { status?: number; message: string } | null = null;

	// Host fallback (www → old.reddit) and UA escalation are INDEPENDENT axes
	// over the same attempt budget: `host` advances every retry; `uaIndex` only
	// advances when a request comes back blocked. So with 3 attempts a blocked
	// request walks www/UA0 → old/UA1 → old/UA2 without growing the budget.
	// get(prefs) returns DEFAULT_PREFS until hydration, so it's always safe here.
	const escalate = get(prefs).uaEscalationEnabled;
	let uaIndex = 0;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const host = attempt === 0 ? HOST_PRIMARY : HOST_FALLBACK;
		const ua = UA_LADDER[Math.min(uaIndex, UA_LADDER.length - 1)];
		try {
			const res = await doRequest(host, ua);
			if (res.status >= 200 && res.status < 300) {
				return { ok: true, data: res.data };
			}
			if (res.status === 429) {
				// Honor Retry-After if present (seconds), but cap it — an
				// uncapped multi-minute wait is indistinguishable from a freeze.
				const ra = Number(res.headers['retry-after']);
				const wait = Math.min(
					Number.isFinite(ra) ? ra * 1000 : 500 * 2 ** attempt,
					MAX_RATE_LIMIT_WAIT_MS
				);
				const jitter = Math.random() * 250;
				lastErr = { status: 429, message: 'rate-limited' };
				// One toast per rate-limit event — `key` dedupes while a same-keyed
				// toast is still on screen, so a burst of retries doesn't spam.
				const seconds = Math.max(1, Math.round(wait / 1000));
				pushToast(`Reddit rate-limited us — retrying in ${seconds}s`, {
					key: 'reddit-rate-limit',
					duration: Math.min(wait + 500, 6000)
				});
				await sleep(wait + jitter);
				continue;
			}
			if (res.status === 403 || res.status === 503) {
				const blocked = looksBlocked(res);
				lastErr = {
					status: res.status,
					message: blocked ? `Reddit blocked this request (${res.status})` : `reddit ${res.status}`
				};
				// On a genuine block, escalate to the next UA identity for the next
				// attempt (which also moves to the fallback host).
				if (escalate && blocked && uaIndex < UA_LADDER.length - 1) uaIndex++;
				continue;
			}
			// Other 4xx/5xx: fail fast — no point retrying a 404.
			return {
				ok: false,
				error: { status: res.status, message: `reddit ${res.status}` }
			};
		} catch (cause) {
			lastErr = { message: cause instanceof Error ? cause.message : 'network error' };
			await sleep(300 * 2 ** attempt);
		}
	}
	return { ok: false, error: lastErr ?? { message: 'unknown error' } };
}

// Only first-page listing fetches (no pagination cursor) are eligible for the
// persistent cache — we never want to cache deep `after=…` pages.
function cacheable(params?: Record<string, string | number | boolean>): boolean {
	return !params || params.after == null || params.after === '';
}

function feedCacheTtlMs(): number {
	return (get(prefs).feedCacheTtlHours || 24) * 3_600_000;
}

export async function getJson<T = unknown>(
	path: string,
	params?: Record<string, string | number | boolean>
): Promise<Result<T>> {
	const url = buildUrl(HOST_PRIMARY, path, params);
	const key = cacheKey('GET', url);
	const cached = cache.get(key);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return { ok: true, data: cached.data as T };
	}
	const r = await withRetries((host, ua) => rawGet(buildUrl(host, path, params), ua));
	if (r.ok) {
		cache.set(key, { at: Date.now(), data: r.data });
		// Persist first pages so a future offline / blocked cold start has fallback.
		if (cacheable(params)) feedCache.put(key, r.data);
		return r as Result<T>;
	}
	// Live fetch failed — serve the persistent cache if we have a recent copy,
	// flagged stale so the UI can show a "showing cached" banner.
	if (cacheable(params)) {
		const entry = feedCache.get(key);
		if (entry && Date.now() - entry.at <= feedCacheTtlMs()) {
			return { ok: true, data: entry.data as T, meta: { staleAt: entry.at } };
		}
	}
	return r as Result<T>;
}

export async function postForm<T = unknown>(
	path: string,
	body: Record<string, string>
): Promise<Result<T>> {
	// POSTs (e.g. /api/morechildren) are not cached.
	const r = await withRetries((host, ua) => rawPost(buildUrl(host, path), body, ua));
	return r as Result<T>;
}

export function clearCache(): void {
	cache.clear();
}

// Fetch an arbitrary URL as text via the native client (okhttp) — used to read
// the v.redd.it DASH manifest, which the WebView can't fetch (CORS). Returns
// null on any failure so callers can fall back.
export async function fetchTextNative(url: string): Promise<string | null> {
	if (!IS_NATIVE) {
		try {
			const r = await fetch(url);
			return r.ok ? await r.text() : null;
		} catch {
			return null;
		}
	}
	try {
		const res = await CapacitorHttp.get({
			url,
			headers: { Referer: 'https://www.reddit.com/' },
			responseType: 'text'
		});
		if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') return res.data;
	} catch {
		// ignore
	}
	return null;
}

function b64ToBuf(b64: string): ArrayBuffer {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}

// Fetch an arbitrary URL as binary via the native client (okhttp). Used to pull
// v.redd.it video/audio MP4 streams for MediaSource muxing. null on failure.
export async function fetchBytesNative(url: string): Promise<ArrayBuffer | null> {
	try {
		if (!IS_NATIVE) {
			const r = await fetch(url);
			return r.ok ? await r.arrayBuffer() : null;
		}
		const res = await CapacitorHttp.get({
			url,
			headers: { Referer: 'https://www.reddit.com/' },
			responseType: 'arraybuffer'
		});
		if (res.status >= 200 && res.status < 300) {
			const d = res.data as unknown;
			if (typeof d === 'string') return b64ToBuf(d);
			if (d instanceof ArrayBuffer) return d;
		}
	} catch {
		// ignore
	}
	return null;
}

// Parse the total resource length out of a Content-Range header
// ("bytes 0-524287/1398210" -> 1398210). null if absent/unparseable.
function parseContentRangeTotal(cr: string | null | undefined): number | null {
	if (!cr) return null;
	const m = /\/\s*(\d+)\s*$/.exec(cr);
	return m ? parseInt(m[1], 10) : null;
}

// Fetch a byte range of a URL via the native client (okhttp), used to stream
// v.redd.it video/audio into MediaSource progressively instead of downloading
// the whole file before playback. Returns the bytes plus the resource's total
// length (from Content-Range) so the caller knows when it has reached the end.
// null on failure or a range past the end (416).
export async function fetchRangeNative(
	url: string,
	start: number,
	end: number
): Promise<{ bytes: ArrayBuffer; total: number | null } | null> {
	const range = `bytes=${start}-${end}`;
	try {
		if (!IS_NATIVE) {
			const r = await fetch(url, {
				headers: { Range: range },
				signal: AbortSignal.timeout(READ_TIMEOUT_MS)
			});
			if (r.status !== 206 && r.status !== 200) return null;
			return {
				bytes: await r.arrayBuffer(),
				total: parseContentRangeTotal(r.headers.get('content-range'))
			};
		}
		const res = await CapacitorHttp.get({
			url,
			headers: { Referer: 'https://www.reddit.com/', Range: range },
			connectTimeout: CONNECT_TIMEOUT_MS,
			readTimeout: READ_TIMEOUT_MS,
			responseType: 'arraybuffer'
		});
		if (res.status < 200 || res.status >= 300) return null;
		const headers = res.headers ?? {};
		const cr = (headers['content-range'] ?? headers['Content-Range']) as string | undefined;
		const d = res.data as unknown;
		let bytes: ArrayBuffer | null = null;
		if (typeof d === 'string') bytes = b64ToBuf(d);
		else if (d instanceof ArrayBuffer) bytes = d;
		if (!bytes) return null;
		return { bytes, total: parseContentRangeTotal(cr) };
	} catch {
		return null;
	}
}

export const _internals = { UA: UA_LADDER[0], UA_LADDER, HOST_PRIMARY, HOST_FALLBACK };
