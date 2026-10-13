// @vitest-environment jsdom
//
// The page reader against pages saved from reddit.com on 2026-10-13 (cut down
// to the parts that matter, see __fixtures__). If Reddit changes its markup,
// these are the tests that say where.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { moreAfter, postsFromPage, seconds, threadFromPage } from './pageReader';

const here = dirname(fileURLToPath(import.meta.url));
const page = (name: string) => readFileSync(resolve(here, '__fixtures__', name), 'utf8');

describe('a subreddit page', () => {
	const listing = postsFromPage(page('subreddit-page.html'));

	it('has the first posts and where to continue from', () => {
		expect(listing.items.length).toBe(3);
		expect(listing.after).toMatch(/^t3_[a-z0-9]+$/);
	});

	it('every post has what a card needs', () => {
		for (const p of listing.items) {
			expect(p.id).toMatch(/^[a-z0-9]+$/);
			expect(p.fullId).toBe(`t3_${p.id}`);
			expect(p.title.length).toBeGreaterThan(0);
			expect(p.subreddit).toBe('okbuddyphd');
			expect(p.author.length).toBeGreaterThan(0);
			expect(p.permalink.startsWith('/r/okbuddyphd/comments/')).toBe(true);
			expect(p.score).toBeGreaterThan(0);
			expect(p.numComments).toBeGreaterThan(0);
			// Saved in October 2026.
			expect(p.createdUtc).toBeGreaterThan(1_780_000_000);
			expect(p.createdUtc).toBeLessThan(1_800_000_000);
		}
	});
});

describe('the "load more" piece of a subreddit page', () => {
	const listing = postsFromPage(page('subreddit-more.html'));
	const byKind = (k: string) => listing.items.filter((p) => p.kind === k);

	it('finds every post once, and the next cursor', () => {
		expect(listing.items.length).toBe(7);
		expect(new Set(listing.items.map((p) => p.id)).size).toBe(7);
		expect(listing.after).toMatch(/^t3_[a-z0-9]+$/);
	});

	it('an image post has a screen-sized picture and the original', () => {
		const p = byKind('image')[0];
		expect(p.preview?.url).toMatch(/^https:\/\/preview\.redd\.it\//);
		expect(p.preview?.width).toBeGreaterThan(0);
		expect(p.preview?.height).toBeGreaterThan(0);
		expect(p.image?.url).toMatch(/^https:\/\/i\.redd\.it\//);
	});

	it('a gallery has all its pictures, including the ones not yet scrolled to', () => {
		const p = byKind('gallery')[0];
		expect(p.gallery!.length).toBeGreaterThan(1);
		for (const g of p.gallery!) {
			expect(g.url).toMatch(/^https:\/\/preview\.redd\.it\//);
			expect(g.fullUrl).toMatch(/^https:\/\/i\.redd\.it\//);
			expect(g.width).toBeGreaterThan(0);
		}
		expect(new Set(p.gallery!.map((g) => g.id)).size).toBe(p.gallery!.length);
		expect(p.preview?.url).toBe(p.gallery![0].url);
	});

	it('a video has a stream, a size, a length and a poster', () => {
		const p = byKind('video').find((v) => !v.video!.isGif)!;
		expect(p.video!.hlsUrl).toMatch(/^https:\/\/v\.redd\.it\/.+HLSPlaylist\.m3u8/);
		expect(p.video!.dashUrl).toMatch(/DASHPlaylist\.mpd/);
		expect(p.video!.width).toBeGreaterThan(0);
		expect(p.video!.height).toBeGreaterThan(0);
		expect(p.video!.duration).toBeGreaterThan(0);
		expect(p.preview?.url).toMatch(/^https:\/\//);
	});

	it('a gif plays as a silent clip', () => {
		const p = byKind('video').find((v) => v.video!.isGif)!;
		expect(p.video!.fallbackUrl).toMatch(/format=mp4/);
		expect(p.video!.hlsUrl).toBeUndefined();
	});

	it('a text post has its text', () => {
		const texts = byKind('text');
		expect(texts.length).toBe(2);
		expect(texts.some((p) => (p.selftext ?? '').length > 40 && (p.selftextHtml ?? '').includes('<p>'))).toBe(true);
	});

	it('flair comes through as words, not markup', () => {
		const flaired = listing.items.filter((p) => p.flair);
		expect(flaired.length).toBeGreaterThan(0);
		for (const p of flaired) expect(p.flair!.text).not.toMatch(/[<>]|\s{2,}/);
	});
});

describe('a post page', () => {
	const thread = threadFromPage(page('post-page.html'));

	it('has the post', () => {
		expect(thread.post?.id).toBe('1wfjght');
		expect(thread.post?.subreddit).toBe('okbuddyphd');
		expect((thread.post?.selftext ?? '').length).toBeGreaterThan(40);
	});

	it('has the first comments, in order, with who said what and when', () => {
		expect(thread.comments.length).toBeGreaterThan(0);
		expect(thread.comments.length).toBeLessThanOrEqual(10);
		for (const c of thread.comments) {
			expect(c.kind).toBe('comment');
			expect(c.fullId).toMatch(/^t1_[a-z0-9]+$/);
			expect(c.author.length).toBeGreaterThan(0);
			expect(c.body.length).toBeGreaterThan(0);
			expect(c.bodyHtml).toContain('<p>');
			expect(c.depth).toBe(0);
			expect(c.createdUtc).toBeGreaterThan(1_780_000_000);
			expect(c.permalink).toContain('/comment/');
		}
	});

	it('knows how many comments there are in all', () => {
		expect(thread.total).toBeGreaterThanOrEqual(thread.comments.length);
		expect(thread.total).toBe(thread.post?.numComments);
	});
});

describe('markup that is not what we expect', () => {
	it('comes back empty instead of throwing', () => {
		for (const html of ['', '<html></html>', 'not html at all', '<shreddit-post></shreddit-post>', '<shreddit-comment></shreddit-comment>']) {
			expect(postsFromPage(html)).toEqual({ items: [], after: null, before: null, more: null });
			const t = threadFromPage(html);
			expect(t.post).toBeNull();
			expect(t.comments).toEqual([]);
		}
	});

	it('replies nest under the comment they answer', () => {
		const c = (id: string, depth: number) =>
			`<shreddit-comment thingid="t1_${id}" depth="${depth}" author="a" score="1" created="2026-10-13T14:16:15.852000+0000"><div slot="comment"><div id="t1_${id}-post-rtjson-content"><p>${id}</p></div></div>`;
		const html = `${c('a', 0)}${c('b', 1)}${c('c', 2)}</shreddit-comment></shreddit-comment>${c('d', 1)}</shreddit-comment></shreddit-comment>${c('e', 0)}</shreddit-comment>`;
		const { comments } = threadFromPage(html);
		expect(comments.map((x) => x.id)).toEqual(['a', 'e']);
		expect(comments[0].replies.map((x) => (x as { id: string }).id)).toEqual(['b', 'd']);
		expect((comments[0].replies[0] as { replies: { id: string }[] }).replies.map((x) => x.id)).toEqual(['c']);
		expect(comments[0].body).toBe('a');
	});
});

describe('the "load more" address', () => {
	it('is found on a subreddit page with its cursor', () => {
		const listing = postsFromPage(page('subreddit-page.html'));
		expect(listing.more).toMatch(/^\/svc\/shreddit\/community-more-posts\//);
		expect(listing.more).toContain('name=okbuddyphd');
		expect(btoa(listing.after!)).toBe(decodeURIComponent(/after=([^&]+)/.exec(listing.more!)![1]));
	});

	it('can be pointed at another place in the feed', () => {
		const sub = moreAfter('/svc/shreddit/community-more-posts/best/?after=AAAA&t=DAY&name=okbuddyphd&navigationSessionId=abc&feedLength=3', 't3_1x3b2d5', 28);
		expect(sub.path).toBe('/svc/shreddit/community-more-posts/best/');
		expect(sub.params).toEqual({ after: btoa('t3_1x3b2d5'), t: 'DAY', name: 'okbuddyphd', feedLength: '28' });

		const front = moreAfter('/svc/shreddit/feeds/popular-feed?after=AAAA&distance=4&adDistance=2&cursor=AAAA&sort=HOT', 't3_1x51xl1', 25);
		expect(front.path).toBe('/svc/shreddit/feeds/popular-feed');
		expect(front.params.after).toBe(btoa('t3_1x51xl1'));
		expect(front.params.cursor).toBe(btoa('t3_1x51xl1'));
		expect(front.params.sort).toBe('HOT');
		expect(front.params.distance).toBe('25');
	});
});

describe('seconds', () => {
	it("reads Reddit's timestamps", () => {
		expect(seconds('2026-10-05T08:37:14.447000+0000')).toBe(Date.UTC(2026, 9, 5, 8, 37, 14) / 1000);
		expect(seconds('2026-10-05T08:37:14+0200')).toBe(Date.UTC(2026, 9, 5, 6, 37, 14) / 1000);
		expect(seconds('2026-10-05T08:37:14Z')).toBe(Date.UTC(2026, 9, 5, 8, 37, 14) / 1000);
		expect(seconds(null)).toBe(0);
		expect(seconds('yesterday')).toBe(0);
	});
});
