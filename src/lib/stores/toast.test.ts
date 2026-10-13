import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { defaultDuration, dismissToast, holdToast, pushToast, releaseToast, toasts } from './toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	for (const t of get(toasts)) dismissToast(t.id);
	vi.useRealTimers();
});

describe('how long a snackbar stays', () => {
	it('is decided by its text and whether it has a button', () => {
		expect(defaultDuration('Saved', false)).toBe(3000);
		expect(defaultDuration('Saved', true)).toBe(6000);
		const long = defaultDuration("Couldn't refresh. Showing what was already loaded.", false);
		expect(long).toBeGreaterThan(3000);
		expect(long).toBeLessThanOrEqual(5500);
	});

	it('goes away on its own', () => {
		pushToast('Link copied');
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(2999);
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(2);
		expect(get(toasts)).toHaveLength(0);
	});

	it('waits while a finger is on it, then runs out what was left', () => {
		pushToast('Link copied');
		const id = get(toasts)[0].id;
		vi.advanceTimersByTime(2500);
		holdToast(id);
		vi.advanceTimersByTime(60_000);
		expect(get(toasts)).toHaveLength(1);
		releaseToast(id);
		// 500 ms were left; it gets the minimum after a hold instead.
		vi.advanceTimersByTime(1400);
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(200);
		expect(get(toasts)).toHaveLength(0);
	});

	it('a toast replaced while held shows the new text and still waits', () => {
		pushToast('Saving image…', { key: 'save', duration: 10_000 });
		const id = get(toasts)[0].id;
		holdToast(id);
		pushToast('Image saved', { key: 'save', replace: true });
		expect(get(toasts)[0].message).toBe('Image saved');
		vi.advanceTimersByTime(30_000);
		expect(get(toasts)).toHaveLength(1);
		releaseToast(id);
		vi.advanceTimersByTime(3001);
		expect(get(toasts)).toHaveLength(0);
	});
});

describe('the stack', () => {
	it('never holds more than two', () => {
		pushToast('one');
		pushToast('two');
		pushToast('three');
		expect(get(toasts).map((t) => t.message)).toEqual(['two', 'three']);
	});

	it('a repeat with the same key is not shown twice', () => {
		pushToast('Slow down', { key: 'rate' });
		pushToast('Slow down', { key: 'rate' });
		expect(get(toasts)).toHaveLength(1);
	});
});
