import { describe, it, expect, vi } from 'vitest';

// session.ts reads storage at import, which only exists in a browser.
vi.mock('$app/environment', () => ({ browser: false }));

const { compressStack } = await import('./session');

describe('compressStack', () => {
	it('leaves a short stack alone', () => {
		expect(compressStack(['/'], 2)).toEqual(['/']);
		expect(compressStack(['/', '/comments/a'], 2)).toEqual(['/', '/comments/a']);
		expect(compressStack(['/', '/r/pics', '/comments/a'], 2)).toEqual(['/', '/r/pics', '/comments/a']);
	});

	it('keeps the root and the tail of a long one', () => {
		const long = ['/', '/subreddits', '/r/pics', '/comments/a', '/u/x', '/comments/b'];
		expect(compressStack(long, 2)).toEqual(['/', '/u/x', '/comments/b']);
		expect(compressStack(long, 4)).toEqual(['/', '/r/pics', '/comments/a', '/u/x', '/comments/b']);
	});

	it('where the user was is always last, and back from it is always second to last', () => {
		const long = Array.from({ length: 28 }, (_, i) => (i === 0 ? '/' : `/comments/p${i}`));
		const out = compressStack(long, 2);
		expect(out).toHaveLength(3);
		expect(out.at(-1)).toBe('/comments/p27');
		expect(out.at(-2)).toBe('/comments/p26');
		expect(out[0]).toBe('/');
	});

	it('drops consecutive repeats, including one created by the cut', () => {
		expect(compressStack(['/', '/', '/r/pics', '/r/pics'], 2)).toEqual(['/', '/r/pics']);
		expect(compressStack(['/', '/a', '/b', '/', '/c'], 2)).toEqual(['/', '/c']);
	});
});
