// Reading Reddit from its own web pages.
//
// The .json endpoints the rest of this folder reads are what Reddit is closing
// to apps that are not signed in (see oauth.ts for the dates). By October 2026
// that had reached the point where whole subreddits answered every .json
// request with the "blocked by network security" page, while the ordinary web
// page for the same subreddit, the one any logged-out visitor gets in a
// browser, still arrived complete: each post as a <shreddit-post> element
// with its title, author, score, comment count, age and media, and the same
// again for the page's own "load more" request.
//
// So when the data route is refused, endpoints.ts asks for the page instead
// and this file turns what is on it into the same Post and Comment objects
// the JSON parsers produce. Nothing here signs in, and nothing here does
// anything a browser showing the page would not: these are plain page loads.
//
// What the page does not give: replies to comments, and comments past the
// first ten. The site fetches those with requests of another kind, which the
// app does not make. The caller is told how many comments there are in all,
// so the screen can say what is missing.
//
// This is markup, not an API. Reddit can change it without notice, and every
// lookup below is written to come back empty, not to throw, when it has. The
// tests run against pages saved on 2026-10-13.

import { isEmbeddableUrl } from './embeds';
import type { Comment, GalleryItem, Listing, MediaImage, MediaVideo, Post, PostKind } from './types';

// The page arrives in pieces: the first screenful inline, the rest inside
// <template> elements that the site's own script moves into place. A query on
// the document does not see into a template, so every query goes over all of
// them.
function rootsOf(html: string): ParentNode[] {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const roots: ParentNode[] = [doc];
	const walk = (root: ParentNode) => {
		for (const t of root.querySelectorAll('template')) {
			roots.push(t.content);
			walk(t.content);
		}
	};
	walk(doc);
	return roots;
}

function all(roots: ParentNode[], selector: string): Element[] {
	return roots.flatMap((r) => [...r.querySelectorAll(selector)]);
}

function num(el: Element, name: string): number {
	const n = Number(el.getAttribute(name));
	return Number.isFinite(n) ? n : 0;
}

function text(el: Element | null | undefined): string {
	return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// "2026-10-05T08:37:14.447000+0000": six digits of fraction and an offset
// with no colon, neither of which Date.parse is obliged to accept.
export function seconds(stamp: string | null): number {
	if (!stamp) return 0;
	const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(?:([+-]\d\d):?(\d\d)|Z)?$/.exec(stamp.trim());
	if (!m) {
		const loose = Date.parse(stamp);
		return Number.isFinite(loose) ? Math.floor(loose / 1000) : 0;
	}
	const ms = (m[2] ?? '0').slice(0, 3).padEnd(3, '0');
	const zone = m[3] ? `${m[3]}:${m[4]}` : 'Z';
	const t = Date.parse(`${m[1]}.${ms}${zone}`);
	return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

// Images below the first are not given a src until they scroll into view.
function srcOf(img: Element | null | undefined): string {
	return img?.getAttribute('src') || img?.getAttribute('data-lazy-src') || '';
}

function picture(img: Element | null | undefined, url = srcOf(img)): MediaImage | undefined {
	if (!img || !url) return undefined;
	return { url, width: num(img, 'width'), height: num(img, 'height') };
}

function videoFrom(player: Element, isGif: boolean): MediaVideo | undefined {
	const src = player.getAttribute('src') ?? '';
	if (!src) return undefined;
	let width = 0;
	let height = 0;
	let duration = 0;
	// Reddit's list of ready-made MP4s, used here only for the size and length.
	try {
		const packed = JSON.parse(player.getAttribute('packaged-media-json') ?? 'null');
		duration = Number(packed?.playbackMp4s?.duration) || 0;
		for (const p of packed?.playbackMp4s?.permutations ?? []) {
			const d = p?.source?.dimensions;
			if (d?.width > width) {
				width = d.width;
				height = d.height ?? 0;
			}
		}
	} catch {
		// no size then; the player works it out from the stream
	}
	if (/\.m3u8(\?|$)/.test(src)) {
		return {
			hlsUrl: src,
			// Same signed address, the other manifest. VideoView tries this
			// first and falls back to the HLS one if it is not there.
			dashUrl: src.replace('HLSPlaylist.m3u8', 'DASHPlaylist.mpd'),
			width,
			height,
			duration,
			isGif
		};
	}
	return { fallbackUrl: src, width, height, duration, isGif: true };
}

function galleryFrom(carousel: Element): GalleryItem[] {
	const out: GalleryItem[] = [];
	for (const li of carousel.querySelectorAll('li')) {
		const imgs = [...li.querySelectorAll('img')];
		const shown = imgs.find((i) => num(i, 'width') > 0 && i.getAttribute('role') !== 'presentation') ?? imgs[0];
		const full = imgs.map(srcOf).find((u) => /^https:\/\/i\.redd\.it\//.test(u));
		const url = srcOf(shown);
		if (!url) continue;
		const stem = /\/([^/?#]+?)(?:\.[a-z0-9]+)?(?:[?#]|$)/i.exec(full ?? url)?.[1];
		out.push({
			id: stem ?? String(out.length),
			url,
			fullUrl: full ?? url,
			width: num(shown, 'width'),
			height: num(shown, 'height')
		});
	}
	return out;
}

function postFrom(el: Element): Post | null {
	const fullId = el.getAttribute('id') ?? '';
	const title = el.getAttribute('post-title') ?? '';
	if (!/^t3_[a-z0-9]+$/i.test(fullId) || !title) return null;

	const permalink = el.getAttribute('permalink') ?? `/comments/${fullId.slice(3)}/`;
	const href = el.getAttribute('content-href') ?? '';
	const type = (el.getAttribute('post-type') ?? '').toLowerCase();
	const media = el.querySelector('[slot="post-media-container"]') ?? el;
	const player = media.querySelector('shreddit-player, shreddit-player-2');
	const carousel = media.querySelector('gallery-carousel');
	const primary =
		media.querySelector('img[data-post-media-primary]') ??
		[...media.querySelectorAll('img')].find((i) => num(i, 'width') > 0 && i.getAttribute('role') !== 'presentation');
	// By id, not by class: the class list is styling and changes with it.
	const body =
		el.querySelector(`[id="${fullId}-post-rtjson-content"]`) ??
		el.querySelector('shreddit-post-text-body [property="schema:articleBody"], shreddit-post-text-body .md');
	const flair = text(el.querySelector('shreddit-post-flair'));

	const post: Post = {
		id: fullId.slice(3),
		fullId,
		kind: 'link',
		title,
		subreddit: el.getAttribute('subreddit-name') || (el.getAttribute('subreddit-prefixed-name') ?? '').replace(/^r\//, ''),
		author: el.getAttribute('author') ?? '[deleted]',
		permalink,
		url: href || `https://www.reddit.com${permalink}`,
		createdUtc: seconds(el.getAttribute('created-timestamp')),
		score: num(el, 'score'),
		upvoteRatio: num(el, 'upvote-ratio'),
		numComments: num(el, 'comment-count'),
		domain: el.getAttribute('domain') ?? '',
		flair: flair ? { text: flair } : undefined,
		over18: el.hasAttribute('nsfw'),
		spoiler: el.hasAttribute('spoiler'),
		stickied: el.hasAttribute('stickied') || el.hasAttribute('pinned'),
		locked: el.hasAttribute('locked'),
		archived: el.hasAttribute('archived'),
		sendReplies: false
	};

	let kind: PostKind = 'link';
	if (carousel) {
		const items = galleryFrom(carousel);
		if (items.length > 0) {
			kind = 'gallery';
			post.gallery = items;
			post.preview = { url: items[0].url, width: items[0].width, height: items[0].height };
		}
	} else if (player) {
		const video = videoFrom(player, type === 'gif' || player.hasAttribute('gif'));
		if (video) {
			kind = 'video';
			post.video = video;
			const poster = player.getAttribute('poster') || srcOf(player.querySelector('img'));
			if (poster) post.preview = { url: poster, width: video.width, height: video.height };
		}
	} else if (primary && (type === 'image' || /^https:\/\/i\.redd\.it\//.test(href))) {
		kind = 'image';
		const shown = picture(primary);
		if (shown) {
			post.preview = shown;
			// The rendition's size stands in for the original's: only the shape
			// is used, and the two have the same one.
			post.image = { ...shown, url: href || shown.url };
			post.previewSource = post.image;
		}
	} else if (type === 'text' || type === 'multi_media' || (!href && body)) {
		kind = 'text';
	} else if (isEmbeddableUrl(href)) {
		kind = 'embed';
	}
	post.kind = kind;

	if (body) {
		post.selftextHtml = body.innerHTML.trim() || undefined;
		post.selftext = text(body) || undefined;
	}
	if (kind === 'link' || kind === 'embed') {
		const thumb = srcOf(el.querySelector('[slot="thumbnail"] img')) || srcOf(primary);
		if (thumb) post.thumbnail = thumb;
	}
	return post;
}

// The page's own "load more" request, e.g.
//   /svc/shreddit/community-more-posts/hot/?after=<cursor>&t=DAY&name=pics&...
//   /svc/shreddit/feeds/popular-feed?after=<cursor>&cursor=<cursor>&sort=HOT&...
// The cursor is the last post's full name in base64, which is also exactly
// what the JSON route calls `after`, so the two can be mixed freely.
function moreFrom(roots: ParentNode[]): { src: string; after: string } | null {
	for (const p of all(roots, 'faceplate-partial[src]')) {
		const src = p.getAttribute('src') ?? '';
		if (!/\/(community-more-posts|feeds\/[a-z-]+-feed)\b/.test(src)) continue;
		const raw = /[?&]after=([^&]+)/.exec(src)?.[1];
		if (!raw) continue;
		try {
			const name = atob(decodeURIComponent(raw));
			if (/^t3_[a-z0-9]+$/i.test(name)) return { src, after: name };
		} catch {
			// not base64 after all
		}
	}
	return null;
}

/**
 * The same "load more" address, pointed at another place in the feed.
 * Returns the path and its query, ready for the client.
 */
export function moreAfter(src: string, after: string, have: number): { path: string; params: Record<string, string> } {
	const url = new URL(src, 'https://www.reddit.com');
	const cursor = btoa(after);
	const params: Record<string, string> = {};
	for (const [k, v] of url.searchParams) {
		// One visit's bookkeeping; not ours to replay.
		if (k === 'navigationSessionId') continue;
		params[k] = k === 'after' || k === 'cursor' ? cursor : k === 'feedLength' || k === 'distance' ? String(have) : v;
	}
	params.after = cursor;
	return { path: url.pathname, params };
}

export interface PageListing extends Listing<Post> {
	/** The page's own "load more" address, when it has one. */
	more: string | null;
}

/** The posts on a feed page, or in one of its "load more" pieces. */
export function postsFromPage(html: string): PageListing {
	const roots = rootsOf(html);
	const items: Post[] = [];
	const seen = new Set<string>();
	for (const el of all(roots, 'shreddit-post')) {
		// A crosspost carries the original inside it; that is not a second post.
		if (el.parentElement?.closest('shreddit-post')) continue;
		const post = postFrom(el);
		if (!post || seen.has(post.id)) continue;
		seen.add(post.id);
		items.push(post);
	}
	const more = moreFrom(roots);
	return { items, after: more?.after ?? null, before: null, more: more?.src ?? null };
}

function commentFrom(el: Element, opAuthor: string): Comment | null {
	const fullId = el.getAttribute('thingid') ?? '';
	if (!/^t1_[a-z0-9]+$/i.test(fullId)) return null;
	// Only this comment's own text: its replies, when present, are further
	// <shreddit-comment> elements inside it with the same slot name.
	const body = [...el.querySelectorAll('[slot="comment"]')].find((b) => b.closest('shreddit-comment') === el);
	const inner = body?.querySelector('[id$="-post-rtjson-content"]') ?? body;
	const author = el.getAttribute('author') ?? '[deleted]';
	return {
		kind: 'comment',
		id: fullId.slice(3),
		fullId,
		author,
		bodyHtml: inner?.innerHTML.trim() ?? '',
		body: text(inner),
		score: num(el, 'score'),
		scoreHidden: !el.hasAttribute('score'),
		createdUtc: seconds(el.getAttribute('created')),
		editedUtc: false,
		depth: num(el, 'depth'),
		permalink: el.getAttribute('permalink') ?? '',
		stickied: el.hasAttribute('is-stickied') || el.hasAttribute('pinned'),
		isSubmitter: !!opAuthor && author === opAuthor,
		distinguished: el.hasAttribute('is-admin-distinguished')
			? 'admin'
			: el.hasAttribute('is-mod-distinguished')
				? 'moderator'
				: null,
		replies: []
	};
}

/**
 * The post on a post's page and the comments that came with it. `total` is
 * how many comments Reddit says the post has, which is usually far more.
 */
export function threadFromPage(html: string): { post: Post | null; comments: Comment[]; total: number } {
	const roots = rootsOf(html);
	const postEl = all(roots, 'shreddit-post').find((el) => !el.parentElement?.closest('shreddit-post'));
	const post = postEl ? postFrom(postEl) : null;

	// In page order, which is thread order: a reply follows its parent and is
	// one level deeper.
	const top: Comment[] = [];
	const open: Comment[] = [];
	const seen = new Set<string>();
	for (const el of all(roots, 'shreddit-comment')) {
		const c = commentFrom(el, post?.author ?? '');
		if (!c || seen.has(c.id)) continue;
		seen.add(c.id);
		open.length = Math.min(open.length, c.depth);
		const parent = open[c.depth - 1];
		if (c.depth > 0 && parent) parent.replies.push(c);
		else top.push(c);
		open[c.depth] = c;
	}

	const tree = all(roots, 'shreddit-comment-tree')[0];
	const stats = all(roots, 'shreddit-comment-tree-stats')[0];
	const total =
		(tree && (num(tree, 'totalcomments') || num(tree, 'total-comments'))) ||
		(stats && num(stats, 'total-comments')) ||
		post?.numComments ||
		top.length;
	return { post, comments: top, total };
}
