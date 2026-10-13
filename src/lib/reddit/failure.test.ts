// What the app makes of the ways Reddit says no. The bodies below are the
// shapes actually seen on a phone in October 2026.

import { describe, expect, it } from 'vitest';
import { coolDownMs, failureFor, failureFromThrown, isJsonBody, looksLikeHtml, worthRetrying } from './failure';

const BLOCK_PAGE = '<body class=theme-beta><div>You\'ve been blocked by network security.</div></body>';
const SIGN_IN_PAGE = '<!DOCTYPE html><html lang="en"><head><title>Log in to use old Reddit</title></head><body></body></html>';
const LISTING = { kind: 'Listing', data: { children: [], after: null, before: null } };

describe('failureFor', () => {
	it('lets a real answer through', () => {
		expect(failureFor(200, LISTING)).toBeNull();
		expect(failureFor(200, [LISTING, LISTING])).toBeNull();
	});

	it('a sign-in page answered with 200 is a refusal, not data', () => {
		expect(failureFor(200, SIGN_IN_PAGE)?.kind).toBe('refused');
		expect(failureFor(200, 'whatever', { 'content-type': 'text/html; charset=utf-8' })?.kind).toBe('refused');
	});

	it('a 200 with nothing usable in it is unreadable', () => {
		expect(failureFor(200, null)?.kind).toBe('unreadable');
		expect(failureFor(200, '')?.kind).toBe('unreadable');
		expect(failureFor(200, 'OK')?.kind).toBe('unreadable');
	});

	it('the 403 block page is a refusal', () => {
		const f = failureFor(403, BLOCK_PAGE);
		expect(f?.kind).toBe('refused');
		expect(f?.status).toBe(403);
		expect(f?.message).toMatch(/refused/i);
	});

	it('a bare 403 in JSON is a refusal too', () => {
		expect(failureFor(403, { message: 'Forbidden', error: 403 })?.kind).toBe('refused');
	});

	it('reads the reason Reddit gives for a closed community', () => {
		expect(failureFor(403, { reason: 'private', message: 'Forbidden', error: 403 })?.kind).toBe('private');
		expect(failureFor(403, { reason: 'quarantined', message: 'Forbidden', error: 403 })?.kind).toBe('restricted');
		expect(failureFor(403, { reason: 'gated', message: 'Forbidden', error: 403 })?.kind).toBe('restricted');
		expect(failureFor(404, { reason: 'banned', message: 'Not Found', error: 404 })?.kind).toBe('banned');
		expect(failureFor(404, { message: 'Not Found', error: 404 })?.kind).toBe('missing');
	});

	it('sorts the rest by status', () => {
		expect(failureFor(429, {})?.kind).toBe('rate-limited');
		expect(failureFor(503, '<html></html>')?.kind).toBe('reddit-down');
		expect(failureFor(500, null)?.kind).toBe('reddit-down');
		expect(failureFor(418, {})?.message).toContain('418');
	});

	it('every message is a sentence a person can read', () => {
		for (const f of [failureFor(403, BLOCK_PAGE), failureFor(404, {}), failureFor(429, {}), failureFor(500, {}), failureFor(200, null)]) {
			expect(f?.message).toMatch(/^[A-Z].*\.$/);
			expect(f?.message).not.toMatch(/undefined|TypeError|—/);
		}
	});
});

describe('failureFromThrown', () => {
	it('a timeout is slow, anything else is no connection', () => {
		expect(failureFromThrown(new DOMException('The operation timed out.', 'TimeoutError')).kind).toBe('slow');
		expect(failureFromThrown(new Error('SocketTimeoutException: timeout')).kind).toBe('slow');
		expect(failureFromThrown(new TypeError('Failed to fetch')).kind).toBe('offline');
		expect(failureFromThrown('nope').kind).toBe('offline');
	});
});

describe('worthRetrying', () => {
	it('only when asking again could change the answer', () => {
		expect(worthRetrying('offline')).toBe(true);
		expect(worthRetrying('reddit-down')).toBe(true);
		expect(worthRetrying('refused')).toBe(false);
		expect(worthRetrying('private')).toBe(false);
		expect(worthRetrying('missing')).toBe(false);
	});
});

describe('helpers', () => {
	it('looksLikeHtml', () => {
		expect(looksLikeHtml(SIGN_IN_PAGE)).toBe(true);
		expect(looksLikeHtml(BLOCK_PAGE)).toBe(true);
		expect(looksLikeHtml(LISTING)).toBe(false);
		expect(looksLikeHtml('plain words')).toBe(false);
	});
	it('isJsonBody', () => {
		expect(isJsonBody(LISTING)).toBe(true);
		expect(isJsonBody([])).toBe(true);
		expect(isJsonBody(SIGN_IN_PAGE)).toBe(false);
		expect(isJsonBody(null)).toBe(false);
	});
});

describe('coolDownMs', () => {
	it('does what Reddit asked, within reason', () => {
		expect(coolDownMs({ 'retry-after': '7' })).toBe(7000);
		expect(coolDownMs({ 'Retry-After': '300' })).toBe(60_000);
		expect(coolDownMs({ 'retry-after': '0' })).toBe(2000);
	});
	it('backs off further each time when Reddit does not say', () => {
		expect(coolDownMs({}, 0)).toBe(2000);
		expect(coolDownMs({}, 1)).toBe(4000);
		expect(coolDownMs({}, 9)).toBe(60_000);
	});
});
