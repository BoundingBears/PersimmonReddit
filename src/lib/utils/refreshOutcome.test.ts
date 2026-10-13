import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { dismissToast, toasts } from '$lib/stores/toast';
import { reportRefresh, sameTop, topOf } from './refreshOutcome';

const posts = (...ids: string[]) => ids.map((id) => ({ id }));
afterEach(() => {
	for (const t of get(toasts)) dismissToast(t.id);
});

describe('after a pull-to-refresh', () => {
	it('says so when the same posts came back', () => {
		const before = topOf(posts('a', 'b', 'c'));
		reportRefresh(before, posts('a', 'b', 'c'), false);
		expect(get(toasts).map((t) => t.message)).toEqual(['Refreshed. No new posts yet.']);
	});

	it('says nothing when there is something new to look at', () => {
		reportRefresh(topOf(posts('a', 'b', 'c')), posts('z', 'a', 'b'), false);
		expect(get(toasts)).toEqual([]);
	});

	it('says nothing on a first load into an empty feed', () => {
		reportRefresh([], posts('a'), false);
		expect(get(toasts)).toEqual([]);
	});

	it('says the old posts are still showing when the reload failed', () => {
		reportRefresh(topOf(posts('a')), posts('a'), true);
		expect(get(toasts)[0].message).toMatch(/Couldn't refresh/);
	});

	it('only looks at the top of the feed', () => {
		expect(sameTop(topOf(posts('a', 'b', 'c', 'd', 'e', 'f')), topOf(posts('a', 'b', 'c', 'd', 'e', 'x')))).toBe(true);
	});
});
