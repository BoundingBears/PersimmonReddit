import { describe, expect, it } from 'vitest';
import { createOAuth, userAgent, type HttpRequest, type HttpResponse } from './oauth';

function setup(respond: (req: Parameters<HttpRequest>[0]) => HttpResponse) {
	const calls: Array<Parameters<HttpRequest>[0]> = [];
	let stored: { deviceId: string; token?: string; expiresAt?: number } | null = null;
	let clock = 1_000_000;
	const oauth = createOAuth({
		clientId: 'abc123',
		owner: 'someone',
		version: '1.3.5',
		http: async (req) => {
			calls.push(req);
			return respond(req);
		},
		store: {
			read: async () => stored,
			write: async (v) => {
				stored = { ...v };
			}
		},
		now: () => clock
	});
	return { oauth, calls, advance: (ms: number) => (clock += ms), stored: () => stored };
}

const ok = (data: unknown): HttpResponse => ({ status: 200, data, headers: {} });
const isToken = (url: string) => url.includes('/api/v1/access_token');

describe('userAgent', () => {
	it('is the format Reddit asks for, naming the app and its owner', () => {
		expect(userAgent('1.3.5', 'someone')).toBe('android:com.persimmon.app:v1.3.5 (by /u/someone)');
	});
});

describe('createOAuth', () => {
	it('gets an application-only token with the client id and no secret, then sends it as a bearer', async () => {
		const { oauth, calls } = setup((req) =>
			isToken(req.url) ? ok({ access_token: 'T1', expires_in: 3600 }) : ok({ kind: 'Listing' })
		);
		const r = await oauth.get('https://oauth.reddit.com/r/all/hot.json');
		expect(r).toEqual({ ok: true, data: { kind: 'Listing' } });

		const [tokenCall, dataCall] = calls;
		expect(tokenCall.method).toBe('POST');
		expect(tokenCall.headers.Authorization).toBe(`Basic ${btoa('abc123:')}`);
		expect(tokenCall.body).toContain('grant_type=https%3A%2F%2Foauth.reddit.com%2Fgrants%2Finstalled_client');
		expect(tokenCall.body).toMatch(/device_id=[0-9a-f]{20,30}$/);
		expect(dataCall.headers.Authorization).toBe('bearer T1');
		// Never a disguised browser string on this transport.
		expect(dataCall.headers['User-Agent']).toBe('android:com.persimmon.app:v1.3.5 (by /u/someone)');
	});

	it('reuses the token until shortly before it expires, and keeps one device id', async () => {
		let issued = 0;
		const { oauth, calls, advance } = setup((req) =>
			isToken(req.url) ? ok({ access_token: `T${++issued}`, expires_in: 3600 }) : ok({})
		);
		await oauth.get('https://oauth.reddit.com/a');
		await oauth.get('https://oauth.reddit.com/b');
		expect(calls.filter((c) => isToken(c.url))).toHaveLength(1);

		advance(3600_000 - 30_000); // inside the safety margin
		await oauth.get('https://oauth.reddit.com/c');
		const tokens = calls.filter((c) => isToken(c.url));
		expect(tokens).toHaveLength(2);
		expect(tokens[0].body?.split('device_id=')[1]).toBe(tokens[1].body?.split('device_id=')[1]);
		expect(calls[calls.length - 1].headers.Authorization).toBe('bearer T2');
	});

	it('shares one token request between simultaneous reads', async () => {
		const { oauth, calls } = setup((req) => (isToken(req.url) ? ok({ access_token: 'T1', expires_in: 3600 }) : ok({})));
		await Promise.all([oauth.get('https://oauth.reddit.com/a'), oauth.get('https://oauth.reddit.com/b')]);
		expect(calls.filter((c) => isToken(c.url))).toHaveLength(1);
	});

	it('fetches a fresh token once when Reddit answers 401, then gives up', async () => {
		let issued = 0;
		const { oauth, calls } = setup((req) => {
			if (isToken(req.url)) return ok({ access_token: `T${++issued}`, expires_in: 3600 });
			return req.headers.Authorization === 'bearer T1' ? { status: 401, data: null, headers: {} } : ok({ fine: true });
		});
		expect(await oauth.get('https://oauth.reddit.com/a')).toEqual({ ok: true, data: { fine: true } });
		expect(calls.filter((c) => isToken(c.url))).toHaveLength(2);

		const always401 = setup((req) => (isToken(req.url) ? ok({ access_token: 'X', expires_in: 3600 }) : { status: 401, data: null, headers: {} }));
		const r = await always401.oauth.get('https://oauth.reddit.com/a');
		expect(r.ok).toBe(false);
		expect(always401.calls.filter((c) => !isToken(c.url))).toHaveLength(2);
	});

	it('reports a refused client id as an error instead of throwing', async () => {
		const { oauth } = setup(() => ({ status: 401, data: { error: 'invalid_client' }, headers: {} }));
		const r = await oauth.get('https://oauth.reddit.com/a');
		expect(r).toEqual({ ok: false, error: { status: 401, message: 'Reddit did not issue a token for this app' } });
	});
});
