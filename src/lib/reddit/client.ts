// HTTP wrapper around Reddit's public JSON endpoints.
//
// Why this layer exists (vs Geddit's plain fetch):
//   1. User-Agent: Reddit aggressively rate-limits / 429s requests with generic
//      browser UAs. A descriptive UA is the documented requirement.
//   2. Referer: preview.redd.it / i.redd.it require Referer=reddit.com to
//      hot-link images. (Set per-image in the UI; we set it here for JSON too.)
//   3. CapacitorHttp on Android: bypasses webview CORS and lets us set custom
//      headers that the webview's fetch is not allowed to set.
//   4. 429 backoff with Retry-After.
//   5. 403 / 503 fallback to old.reddit.com (sometimes more permissive).
//   6. In-memory dedupe cache (60s) to avoid re-hitting Reddit when the user
//      navigates back and forth.
//   7. Typed Result<T> instead of swallowing errors with `.catch(() => null)`.

import { CapacitorHttp } from '@capacitor/core';
import { IS_NATIVE } from '$lib/utils/platform';
import { pushToast } from '$lib/stores/toast';
import type { Result } from './types';

const UA = `android:com.persimmon.app:v${__APP_VERSION__} (read-only scraper)`;
const HOST_PRIMARY = 'https://www.reddit.com';
const HOST_FALLBACK = 'https://old.reddit.com';
const CACHE_TTL_MS = 60_000;
const MAX_ATTEMPTS = 3;

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

interface RawResponse {
	status: number;
	data: unknown;
	headers: Record<string, string>;
}

async function rawGet(url: string): Promise<RawResponse> {
	if (IS_NATIVE) {
		const res = await CapacitorHttp.get({
			url,
			headers: {
				'User-Agent': UA,
				Referer: HOST_PRIMARY,
				Accept: 'application/json'
			},
			responseType: 'json'
		});
		return { status: res.status, data: res.data, headers: res.headers ?? {} };
	}
	// Web / dev. fetch can't override User-Agent in browsers, but Reddit allows
	// CORS for unauth JSON without a custom UA — so this works for `npm run dev`.
	const res = await fetch(url, { headers: { Accept: 'application/json' } });
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

async function rawPost(url: string, body: Record<string, string>): Promise<RawResponse> {
	if (IS_NATIVE) {
		const res = await CapacitorHttp.post({
			url,
			headers: {
				'User-Agent': UA,
				Referer: HOST_PRIMARY,
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			data: body,
			responseType: 'json'
		});
		return { status: res.status, data: res.data, headers: res.headers ?? {} };
	}
	const params = new URLSearchParams(body);
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: params.toString()
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
	doRequest: (host: string) => Promise<RawResponse>
): Promise<Result<unknown>> {
	let lastErr: { status?: number; message: string } | null = null;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const host = attempt === 0 ? HOST_PRIMARY : HOST_FALLBACK;
		try {
			const res = await doRequest(host);
			if (res.status >= 200 && res.status < 300) {
				return { ok: true, data: res.data };
			}
			if (res.status === 429) {
				// Honor Retry-After if present (seconds).
				const ra = Number(res.headers['retry-after']);
				const wait = Number.isFinite(ra) ? ra * 1000 : 500 * 2 ** attempt;
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
				lastErr = { status: res.status, message: `reddit ${res.status}` };
				// fall through to next attempt (which uses HOST_FALLBACK)
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
	const r = await withRetries((host) => rawGet(buildUrl(host, path, params)));
	if (r.ok) cache.set(key, { at: Date.now(), data: r.data });
	return r as Result<T>;
}

export async function postForm<T = unknown>(
	path: string,
	body: Record<string, string>
): Promise<Result<T>> {
	// POSTs (e.g. /api/morechildren) are not cached.
	const r = await withRetries((host) => rawPost(buildUrl(host, path), body));
	return r as Result<T>;
}

export function clearCache(): void {
	cache.clear();
}

export const _internals = { UA, HOST_PRIMARY, HOST_FALLBACK };
