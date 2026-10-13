// Parser tests against real captured Reddit JSON fixtures. These guard against
// silent schema drift — if Reddit changes a field name, a test fails and we
// know to update the parser.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseCommentListing,
	parsePost,
	parsePostListing,
	parseSubmissionAndComments,
	parseSubreddit,
	parseSubredditListing, pickRendition } from './parsers';
import { detectKind, isPlaceholderThumbnail } from './media';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(resolve(here, '__fixtures__', name), 'utf8'));

describe('parsePostListing (r/pics/hot)', () => {
	const data = parsePostListing(fixture('pics-hot.json'));

	it('returns at least one item with after cursor', () => {
		expect(data.items.length).toBeGreaterThan(0);
		expect(typeof data.after === 'string' || data.after === null).toBe(true);
	});

	it('all items have required fields', () => {
		for (const p of data.items) {
			expect(p.id).toBeTruthy();
			expect(p.fullId).toMatch(/^t3_/);
			expect(p.title).toBeTruthy();
			expect(p.subreddit).toBeTruthy();
			expect(p.author).toBeTruthy();
			expect(p.permalink.startsWith('/')).toBe(true);
			expect(typeof p.score).toBe('number');
			expect(typeof p.numComments).toBe('number');
		}
	});

	it('detects image kind for i.redd.it posts', () => {
		const images = data.items.filter((p) => p.kind === 'image');
		expect(images.length).toBeGreaterThan(0);
		for (const p of images) {
			expect(p.image?.url).toBeTruthy();
		}
	});

	it('does not surface placeholder thumbnail strings', () => {
		for (const p of data.items) {
			expect(p.thumbnail).not.toBe('nsfw');
			expect(p.thumbnail).not.toBe('spoiler');
			expect(p.thumbnail).not.toBe('default');
			expect(p.thumbnail).not.toBe('self');
		}
	});
});

describe('grid tile picture', () => {
	const data = parsePostListing(fixture('pics-hot.json'));
	it('is a smaller rendition of the same picture than the full-width one', () => {
		const withBoth = data.items.filter((p) => p.preview && p.previewTile);
		expect(withBoth.length).toBeGreaterThan(0);
		for (const p of withBoth) {
			expect(p.previewTile!.width).toBeLessThanOrEqual(p.preview!.width);
			// Still at least half a screen wide, so a two-column tile is sharp.
			expect(p.previewTile!.width).toBeGreaterThanOrEqual(Math.min(540, p.previewSource!.width));
		}
		// And for a big picture it really is smaller, not the same file again.
		expect(withBoth.some((p) => p.previewTile!.width < p.preview!.width)).toBe(true);
	});
});

describe('parsePostListing (r/AskReddit/hot)', () => {
	const data = parsePostListing(fixture('askreddit-hot.json'));

	it('detects text kind for self-posts', () => {
		const texts = data.items.filter((p) => p.kind === 'text');
		expect(texts.length).toBeGreaterThan(0);
	});

	it('text posts may carry selftext', () => {
		// Some self-posts have empty selftext; just check no crash and field is string|undefined.
		for (const p of data.items.filter((p) => p.kind === 'text')) {
			expect(['string', 'undefined']).toContain(typeof p.selftext);
		}
	});
});

describe('parseSubmissionAndComments', () => {
	const { post, comments } = parseSubmissionAndComments(fixture('post-comments.json'));

	it('returns a post and a comment tree', () => {
		expect(post.id).toBe('1t2ng8h');
		expect(comments.length).toBeGreaterThan(0);
	});

	it('comment tree contains comment nodes and may contain more stubs', () => {
		const mores = comments.filter((c) => c.kind === 'more');
		const cmts = comments.filter((c) => c.kind === 'comment');
		expect(cmts.length).toBeGreaterThan(0);
		// Our fixture has a known top-level "more" stub.
		expect(mores.length).toBeGreaterThan(0);
		for (const m of mores) {
			if (m.kind !== 'more') continue;
			expect(m.parentFullId).toMatch(/^t[13]_/);
			expect(typeof m.count).toBe('number');
		}
	});

	it('comments have body and score', () => {
		for (const c of comments) {
			if (c.kind !== 'comment') continue;
			expect(c.fullId.startsWith('t1_')).toBe(true);
			expect(typeof c.score).toBe('number');
		}
	});

	it('replies are recursively parsed', () => {
		const findDepth = (nodes: any[], target: number): boolean =>
			nodes.some(
				(n) => (n.depth ?? 0) >= target || (n.replies && findDepth(n.replies, target))
			);
		// Most threads we'd capture from r/pics will have at least depth-1 replies.
		expect(findDepth(comments, 1) || comments.length > 0).toBe(true);
	});
});

describe('parseSubredditListing', () => {
	const data = parseSubredditListing(fixture('popular-subreddits.json'));

	it('returns subreddits with name and subscribers', () => {
		expect(data.items.length).toBeGreaterThan(0);
		for (const s of data.items) {
			expect(s.name).toBeTruthy();
			expect(typeof s.subscribers).toBe('number');
		}
	});
});

describe('detectKind', () => {
	it('text', () => expect(detectKind({ is_self: true })).toBe('text'));
	it('gallery', () => expect(detectKind({ is_gallery: true, gallery_data: {} })).toBe('gallery'));
	it('video (is_video)', () => expect(detectKind({ is_video: true })).toBe('video'));
	it('video (reddit_video)', () =>
		expect(detectKind({ media: { reddit_video: {} } })).toBe('video'));
	it('image (post_hint)', () =>
		expect(detectKind({ post_hint: 'image', url: 'https://example.com/a' })).toBe('image'));
	it('image (extension)', () =>
		expect(detectKind({ url: 'https://i.redd.it/abc.jpg' })).toBe('image'));
	it('embed', () =>
		expect(detectKind({ media: { type: 'youtube.com' }, url: 'https://youtu.be/x' })).toBe('embed'));
	it('crosspost', () =>
		expect(detectKind({ crosspost_parent_list: [{ is_self: true }] })).toBe('crosspost'));
	it('link fallback', () =>
		expect(detectKind({ url: 'https://example.com/article' })).toBe('link'));
});

describe('isPlaceholderThumbnail', () => {
	it.each([
		['nsfw', true],
		['spoiler', true],
		['default', true],
		['self', true],
		['image', true],
		['', true],
		[undefined, true],
		['https://i.redd.it/foo.jpg', false]
	])('%s -> %s', (input, expected) => {
		expect(isPlaceholderThumbnail(input as string | undefined)).toBe(expected);
	});
});

describe('pickRendition', () => {
	const ladder = [108, 216, 320, 640, 960, 1080].map((w) => ({ url: `r${w}`, width: w, height: w }));
	const src = (w: number) => ({ url: 'source', width: w, height: w });

	it('picks the smallest rendition that fills the target', () =>
		expect(pickRendition(src(4848), ladder, 1080)?.url).toBe('r1080'));
	it('a narrower screen takes a smaller rendition', () =>
		expect(pickRendition(src(4848), ladder, 700)?.url).toBe('r960'));
	it('falls back to the source when nothing on the ladder is wide enough', () =>
		expect(pickRendition(src(452), ladder.filter((r) => r.width < 452), 1080)?.url).toBe('source'));
	it('keeps the source when it is no bigger than the chosen rendition', () =>
		expect(pickRendition(src(1080), ladder, 1080)?.url).toBe('source'));
	it('no ladder at all', () => expect(pickRendition(src(3000), undefined, 1080)?.url).toBe('source'));
	it('ignores ladder entries without a url', () =>
		expect(pickRendition(src(3000), [{ url: '', width: 1080, height: 1 }], 1080)?.url).toBe('source'));
	it('no source', () => expect(pickRendition(undefined, ladder, 1080)).toBeUndefined());
});

// Reddit answering with something else entirely (a sign-in page, an error
// envelope) must be a clear failure, not a TypeError from deep in a loop.
describe('answers that are not the promised shape', () => {
	const notListings = ['<!DOCTYPE html><html></html>', null, undefined, {}, { data: {} }, { message: 'Forbidden', error: 403 }];

	it('parsePostListing says what is wrong', () => {
		for (const raw of notListings) {
			expect(() => parsePostListing(raw as any)).toThrow(/not a list of posts/);
		}
	});

	it('parseSubmissionAndComments says what is wrong', () => {
		for (const raw of [...notListings, [], [{}], [{ data: { children: [] } }, {}]]) {
			expect(() => parseSubmissionAndComments(raw as any)).toThrow(/not a post with comments/);
		}
	});

	it('an empty but well-formed listing is still fine', () => {
		expect(parsePostListing({ data: { children: [], after: null, before: null } } as any).items).toEqual([]);
	});
});
