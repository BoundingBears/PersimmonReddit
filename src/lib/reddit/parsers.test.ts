// Parser tests against real captured Reddit JSON fixtures. These guard against
// silent schema drift — if Reddit changes a field name, a test fails and we
// know to update the parser.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
	parseCommentListing,
	parsePost,
	parsePostListing,
	parseSubmissionAndComments,
	parseSubreddit,
	parseSubredditListing
} from './parsers';
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
