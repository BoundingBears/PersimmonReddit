// Reading Reddit the way Reddit says an app should: with an OAuth client ID
// that Reddit issued to this app, an honest User-Agent, and a bearer token.
//
// State of play (October 2026, see the sources in the project notes):
//   - Reddit announced in May 2026 that requests "without OAuth or user
//     credentials will be blocked". The anonymous transport in client.ts,
//     which reads the same .json endpoints a logged-out browser does, is the
//     thing that announcement is aimed at. It works today; it is not a
//     supported path and can stop without notice.
//   - New requests for Data API access close on 2026-10-31, and public access
//     ends for everyone without a written agreement in March 2027.
// So this transport is dormant until the app has a client ID of its own. It
// switches on when one is supplied at build time (REDDIT_CLIENT_ID, with
// REDDIT_APP_OWNER as the Reddit username of whoever answers for the app), and
// from then on getJson() uses it INSTEAD of the anonymous transport, never as
// a way to keep the old one going on the side.
//
// The token is application-only (the "installed_client" grant): no user signs
// in, which is the promise the app makes. Whether Reddit keeps offering that
// grant to approved apps is not known; if an agreement requires user sign-in
// instead, tokenRequest() below is the one place that changes.
//
// What comes with this route, from Reddit's Data API terms, and is NOT handled
// here: content kept on the device should be refreshed or dropped within 48
// hours and deleted posts removed (offline.ts keeps saved posts indefinitely),
// the app needs a privacy policy, and it may not show ads.

import { failure, failureFor, failureFromThrown } from './failure';
import type { Result } from './types';

export const OAUTH_HOST = 'https://oauth.reddit.com';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const INSTALLED_CLIENT_GRANT = 'https://oauth.reddit.com/grants/installed_client';
// Ask for a new token this long before the old one runs out.
const EXPIRY_MARGIN_MS = 60_000;

export interface HttpResponse {
	status: number;
	data: unknown;
	headers: Record<string, string>;
}
export type HttpRequest = (req: {
	method: 'GET' | 'POST';
	url: string;
	headers: Record<string, string>;
	body?: string;
}) => Promise<HttpResponse>;

interface StoredToken {
	deviceId: string;
	token?: string;
	expiresAt?: number;
}
export interface TokenStore {
	read(): Promise<StoredToken | null>;
	write(value: StoredToken): Promise<void>;
}

export interface OAuthOptions {
	clientId: string;
	// Reddit username of the person responsible for the app, for the User-Agent.
	owner: string;
	version: string;
	http: HttpRequest;
	store: TokenStore;
	now?: () => number;
}

// Reddit asks for exactly this shape and for it never to be disguised:
//   <platform>:<app ID>:<version string> (by /u/<reddit username>)
export function userAgent(version: string, owner: string): string {
	return `android:com.persimmon.app:v${version} (by /u/${owner})`;
}

function newDeviceId(): string {
	// Reddit wants 20 to 30 characters, unique per device, made up by the client.
	const bytes = new Uint8Array(15);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 26);
}

function basicAuth(clientId: string): string {
	// An installed app has no secret: the password half is empty.
	return `Basic ${btoa(`${clientId}:`)}`;
}

export function createOAuth(options: OAuthOptions) {
	const now = options.now ?? Date.now;
	const ua = userAgent(options.version, options.owner);
	let state: StoredToken | null = null;
	let pending: Promise<string | null> | null = null;

	async function load(): Promise<StoredToken> {
		if (!state) state = (await options.store.read()) ?? { deviceId: newDeviceId() };
		return state;
	}

	async function tokenRequest(deviceId: string): Promise<HttpResponse> {
		return options.http({
			method: 'POST',
			url: TOKEN_URL,
			headers: {
				Authorization: basicAuth(options.clientId),
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': ua
			},
			body: `grant_type=${encodeURIComponent(INSTALLED_CLIENT_GRANT)}&device_id=${encodeURIComponent(deviceId)}`
		});
	}

	async function fetchToken(): Promise<string | null> {
		const s = await load();
		const res = await tokenRequest(s.deviceId);
		const body = res.data as { access_token?: string; expires_in?: number } | null;
		if (res.status !== 200 || !body?.access_token) return null;
		s.token = body.access_token;
		s.expiresAt = now() + (body.expires_in ?? 3600) * 1000;
		await options.store.write(s);
		return s.token;
	}

	/** A valid token, fetching one if needed. Concurrent callers share one request. */
	async function token(): Promise<string | null> {
		const s = await load();
		if (s.token && s.expiresAt && s.expiresAt - EXPIRY_MARGIN_MS > now()) return s.token;
		pending ??= fetchToken().finally(() => (pending = null));
		return pending;
	}

	async function forget(): Promise<void> {
		const s = await load();
		s.token = undefined;
		s.expiresAt = undefined;
		await options.store.write(s);
	}

	/** GET a full oauth.reddit.com URL. One retry with a fresh token on a 401. */
	async function get(url: string): Promise<Result<unknown>> {
		try {
			for (let attempt = 0; attempt < 2; attempt++) {
				const bearer = await token();
				if (!bearer) return { ok: false, error: { status: 401, message: 'Reddit did not issue a token for this app' } };
				const res = await options.http({
					method: 'GET',
					url,
					headers: { Authorization: `bearer ${bearer}`, 'User-Agent': ua }
				});
				if (res.status >= 200 && res.status < 300) return { ok: true, data: res.data };
				if (res.status === 401 && attempt === 0) {
					await forget();
					continue;
				}
				return { ok: false, error: failureFor(res.status, res.data, res.headers) ?? failure('unreadable', res.status) };
			}
			return { ok: false, error: { status: 401, message: 'Reddit rejected the app token' } };
		} catch (cause) {
			return { ok: false, error: failureFromThrown(cause) };
		}
	}

	return { get, token, userAgent: ua };
}
