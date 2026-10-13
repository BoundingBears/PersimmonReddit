// Typed wrappers around Reddit's public JSON endpoints. One function per route.
// All return Result<T> — callers must handle the error case explicitly.

import { getJson, getPage, postForm } from './client';
import { failure, worthRetrying } from './failure';
import { moreAfter, postsFromPage, threadFromPage } from './pageReader';
import {
	parseCommentListing,
	parsePostListing,
	parseSubmissionAndComments,
	parseSubreddit,
	parseSubredditListing,
	parseSubredditRules,
	parseUser,
	parseUserOverview
} from './parsers';
import type {
	CommentNode,
	CommentSort,
	Listing,
	Post,
	Result,
	ResultMeta,
	Sort,
	Subreddit,
	SubredditRule,
	TimeRange,
	User
} from './types';

const DEFAULT_LIMIT = 25;

function defaults(opts?: Record<string, string | number | boolean>) {
	// Spread instead of mutating a closure variable (Geddit's Object.assign bug).
	return { limit: DEFAULT_LIMIT, include_over_18: true, raw_json: 1, ...opts };
}

// A response that is JSON but not the shape the endpoint promises makes the
// parser throw. That is a failed request like any other, not an exception for
// the page to print.
function map<T, U>(r: Result<T>, fn: (v: T) => U): Result<U> {
	if (!r.ok) return r;
	try {
		return { ok: true, data: fn(r.data), meta: r.meta };
	} catch (cause) {
		console.error('unexpected response from Reddit', cause);
		return { ok: false, error: failure('unreadable', undefined, cause) };
	}
}

// ---------- Submissions ----------

export async function getSubmissions(
	sort: Sort = 'hot',
	subreddit?: string,
	opts?: { limit?: number; after?: string; t?: TimeRange }
): Promise<Result<Listing<Post>>> {
	const path = subreddit ? `/r/${subreddit}/${sort}.json` : `/${sort}.json`;
	const viaData = async (quick: boolean) => map(await getJson<any>(path, defaults(opts), { quick }), parsePostListing);

	// Reddit refuses the data route for whole subreddits now, and for most
	// requests past the first page of any feed, while still serving the web
	// pages for the same things (pageReader.ts). So: one quick try at the data
	// route, the page if that is refused, and only if the page fails as well
	// the data route again with everything it has (retries, the saved copy).
	const key = `${(subreddit ?? '').toLowerCase()}/${sort}`;
	if ((refusedUntil.get(key) ?? 0) < Date.now()) {
		const quick = await viaData(true);
		if (quick.ok) return quick;
		if (!pageWorthTrying(quick.error)) return worthRetrying(quick.error.kind ?? 'unreadable') ? viaData(false) : quick;
	}
	const page = await readFeedPages(key, sort, subreddit, opts);
	if (page.ok) {
		refusedUntil.set(key, Date.now() + REFUSAL_MEMORY_MS);
		return page;
	}
	refusedUntil.delete(key);
	return viaData(false);
}

// ---------- The same things, read from Reddit's web pages ----------

type Failed = Extract<Result<unknown>, { ok: false }>['error'];

// A feed that was refused a moment ago will be refused again: go to its page
// directly for a while instead of asking and being told no each time the user
// scrolls.
const REFUSAL_MEMORY_MS = 10 * 60_000;
const refusedUntil = new Map<string, number>();
// Each feed page's own "load more" address, as last seen on the page.
const moreAddress = new Map<string, string>();

function pageWorthTrying(error: Failed): boolean {
	return error.kind === 'refused' || error.kind === 'unreadable';
}

const PAGE_TIME: Record<TimeRange, string> = {
	hour: 'HOUR',
	day: 'DAY',
	week: 'WEEK',
	month: 'MONTH',
	year: 'YEAR',
	all: 'ALL'
};

async function readFeedPages(
	key: string,
	sort: Sort,
	subreddit: string | undefined,
	opts?: { after?: string; t?: TimeRange }
): Promise<Result<Listing<Post>>> {
	const pagePath = subreddit ? `/r/${subreddit}/${sort}/` : `/${sort}/`;
	const readPage = async () => {
		const html = await getPage(pagePath, opts?.t ? { t: opts.t } : undefined);
		if (!html.ok) return html;
		const listing = postsFromPage(html.data);
		if (listing.more) moreAddress.set(key, listing.more);
		return { ok: true as const, data: listing };
	};
	// Where the page asks for more, when the page itself has not been read:
	// a feed whose first posts came by the data route and whose next ones were
	// refused. These two are the addresses the pages use (2026-10).
	const knownMore = (): string | null => {
		const t = PAGE_TIME[opts?.t ?? 'day'];
		if (!subreddit || subreddit.toLowerCase() === 'popular') {
			return `/svc/shreddit/feeds/popular-feed?after=x&cursor=x&distance=0&sort=${sort.toUpperCase()}&t=${t}`;
		}
		if (subreddit.toLowerCase() === 'all') return null;
		return `/svc/shreddit/community-more-posts/${sort}/?after=x&t=${t}&name=${encodeURIComponent(subreddit)}&feedLength=0`;
	};

	let first: Listing<Post> = { items: [], after: opts?.after ?? null, before: null };
	if (!opts?.after) {
		// The page itself carries only the first three posts.
		const page = await readPage();
		if (!page.ok) return page;
		first = page.data;
		if (first.items.length === 0) return { ok: false, error: failure('unreadable') };
		if (!first.after) return { ok: true, data: { items: first.items, after: null, before: null } };
	}
	let src = moreAddress.get(key) ?? knownMore();
	if (!src) {
		const page = await readPage();
		src = page.ok ? page.data.more : null;
		if (!src) return { ok: false, error: failure('unreadable') };
	}
	const next = moreAfter(src, first.after as string, first.items.length);
	const html = await getPage(next.path, next.params);
	if (!html.ok) {
		return first.items.length > 0 ? { ok: true, data: { items: first.items, after: first.after, before: null } } : html;
	}
	const rest = postsFromPage(html.data);
	if (rest.more) moreAddress.set(key, rest.more);
	const seen = new Set(first.items.map((p) => p.id));
	return {
		ok: true,
		data: {
			items: [...first.items, ...rest.items.filter((p) => !seen.has(p.id))],
			// No new posts means the end, whatever cursor came with them.
			after: rest.items.length > 0 ? rest.after : null,
			before: null
		}
	};
}

// Merge a feed across multiple subreddits without using Reddit's multireddit
// endpoint (`/r/sub1+sub2/...`), which now requires OAuth and 301-redirects to
// the homepage when called unauthenticated. We fetch each sub in parallel and
// merge the results client-side.
//
// Strategy:
//   - 'new': chronological merge (createdUtc desc). Same item from many subs
//     interleaves naturally by timestamp.
//   - 'hot' / 'top' / 'rising' / 'controversial': round-robin merge.
//     Takes #1-from-each-sub, then #2-from-each, etc., preserving each sub's
//     own ranking and giving every sub equal representation. Avoids the
//     "biggest sub drowns everyone else" problem that pure-score sorting has.
export async function getMergedSubmissions(
	subs: string[],
	sort: Sort = 'hot',
	opts?: { limitPerSub?: number; t?: TimeRange }
): Promise<Result<Listing<Post>>> {
	if (subs.length === 0) {
		return { ok: true, data: { after: null, before: null, items: [] } };
	}
	const perSub = opts?.limitPerSub ?? 25;
	const results = await Promise.all(
		subs.map((s) => getSubmissions(sort, s, { limit: perSub, t: opts?.t }))
	);

	const lists: Post[][] = [];
	const failures: Array<Extract<Result<unknown>, { ok: false }>['error']> = [];
	let oldestStaleAt: number | undefined;
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		if (r.ok) {
			// If any sub was served from the persistent cache, the merged feed is
			// (partly) stale — surface the oldest cached timestamp.
			if (r.meta?.staleAt) {
				oldestStaleAt = oldestStaleAt ? Math.min(oldestStaleAt, r.meta.staleAt) : r.meta.staleAt;
			}
			// Drop stickied posts from merged feeds — they're useful on an
			// individual sub's page (mod announcements specific to that sub),
			// but in a round-robin merge across N subs they pile up at the
			// top as weeks-old noise.
			lists.push(r.data.items.filter((p) => !p.stickied));
		} else {
			failures.push(r.error);
		}
	}

	let merged: Post[];
	if (sort === 'new') {
		merged = lists.flat().sort((a, b) => b.createdUtc - a.createdUtc);
	} else {
		// Round-robin: zip the per-sub lists together by index.
		merged = [];
		const maxLen = Math.max(0, ...lists.map((l) => l.length));
		for (let i = 0; i < maxLen; i++) {
			for (const list of lists) {
				if (list[i]) merged.push(list[i]);
			}
		}
	}

	// Dedupe (a post can be cross-listed if subs overlap on rare reposts).
	const seen = new Set<string>();
	const deduped = merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

	// Nothing loaded: the reason the first one gave stands for all of them
	// (in practice they fail together and for the same reason).
	if (failures.length === subs.length) return { ok: false, error: failures[0] };
	const meta: ResultMeta = {};
	if (oldestStaleAt) meta.staleAt = oldestStaleAt;
	if (failures.length > 0) {
		meta.missing = {
			failed: failures.length,
			total: subs.length,
			refused: failures.some((f) => f.kind === 'refused')
		};
	}
	return { ok: true, data: { after: null, before: null, items: deduped }, meta };
}

export async function getSubmission(id: string): Promise<Result<Post>> {
	const r = await getJson<any>(`/by_id/t3_${id}.json`);
	return map(r, (json) => parsePostListing(json).items[0]);
}

export async function getSubmissionComments(
	id: string,
	opts?: { sort?: CommentSort; limit?: number; depth?: number },
	// whole: the complete thread or nothing. Without it, a refused thread comes
	// back as the handful of comments on the post's web page, flagged in
	// `meta.partial` so the screen can say what is missing.
	how: { whole?: boolean } = {}
): Promise<Result<{ post: Post; comments: CommentNode[] }>> {
	const viaData = async (quick: boolean) =>
		map(await getJson<any>(`/comments/${id}.json`, defaults(opts), { quick }), parseSubmissionAndComments);
	if (how.whole) return viaData(false);

	const quick = await viaData(true);
	if (quick.ok) return quick;
	if (!pageWorthTrying(quick.error)) return worthRetrying(quick.error.kind ?? 'unreadable') ? viaData(false) : quick;

	const sort = opts?.sort && opts.sort !== 'best' && opts.sort !== 'confidence' ? { sort: opts.sort } : undefined;
	const html = await getPage(`/comments/${id}/`, sort);
	if (html.ok) {
		const thread = threadFromPage(html.data);
		if (thread.post) {
			return {
				ok: true,
				data: { post: thread.post, comments: thread.comments },
				meta: { partial: { shown: thread.comments.length, total: thread.total } }
			};
		}
	}
	return viaData(false);
}

// Expand "load more comments" stubs. We *do not* use /api/morechildren even
// though that's the obvious endpoint — Reddit returns HTML-rendered comments
// inside a `content` field instead of standard JSON, even when api_type=json.
// /api/info.json gives us the same comments in proper JSON shape (author,
// body, body_html, score, created_utc, ...) which our parser actually
// handles. Reddit caps `id` at 100 fullnames per call so we chunk.
export async function getMoreChildren(
	_linkFullId: string, // unused — kept in signature for API compat
	childIds: string[],
	_sort: CommentSort = 'best' // unused — /api/info doesn't sort
): Promise<Result<CommentNode[]>> {
	if (childIds.length === 0) return { ok: true, data: [] };

	const fullnames = childIds.map((id) => (id.startsWith('t1_') ? id : `t1_${id}`));
	const chunks: string[][] = [];
	for (let i = 0; i < fullnames.length; i += 100) {
		chunks.push(fullnames.slice(i, i + 100));
	}

	const parsed: CommentNode[] = [];
	for (const chunk of chunks) {
		const r = map(await getJson<any>('/api/info.json', { id: chunk.join(','), raw_json: 1 }), parseCommentListing);
		if (!r.ok) return r;
		parsed.push(...r.data);
	}
	return { ok: true, data: parsed };
}

// ---------- Subreddits ----------

export async function getSubreddit(name: string): Promise<Result<Subreddit>> {
	const r = await getJson<any>(`/r/${name}/about.json`);
	return map(r, (j) => parseSubreddit(j.data));
}

export async function getSubredditRules(name: string): Promise<Result<SubredditRule[]>> {
	const r = await getJson<any>(`/r/${name}/about/rules.json`);
	return map(r, parseSubredditRules);
}

export async function getPopularSubreddits(opts?: { limit?: number; after?: string }) {
	const r = await getJson<any>('/subreddits/popular.json', defaults(opts));
	return map(r, parseSubredditListing);
}

export async function getNewSubreddits(opts?: { limit?: number; after?: string }) {
	const r = await getJson<any>('/subreddits/new.json', defaults(opts));
	return map(r, parseSubredditListing);
}

export async function getDefaultSubreddits(opts?: { limit?: number; after?: string }) {
	const r = await getJson<any>('/subreddits/default.json', defaults(opts));
	return map(r, parseSubredditListing);
}

// ---------- Search ----------

export async function searchPosts(
	q: string,
	opts?: { limit?: number; after?: string; sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments'; t?: TimeRange; subreddit?: string }
): Promise<Result<Listing<Post>>> {
	const { subreddit, ...rest } = opts ?? {};
	const path = subreddit ? `/r/${subreddit}/search.json` : '/search.json';
	const params: Record<string, string | number | boolean> = { q, type: 'link', ...rest };
	if (subreddit) params.restrict_sr = 'on';
	const r = await getJson<any>(path, defaults(params));
	return map(r, parsePostListing);
}

export async function searchSubreddits(
	q: string,
	opts?: { limit?: number; after?: string }
): Promise<Result<Listing<Subreddit>>> {
	const r = await getJson<any>('/subreddits/search.json', defaults({ q, ...opts }));
	return map(r, parseSubredditListing);
}

export async function searchUsers(
	q: string,
	opts?: { limit?: number; after?: string }
): Promise<Result<Listing<User>>> {
	const r = await getJson<any>('/users/search.json', defaults({ q, ...opts }));
	return map(r, (j) => ({
		after: j.data.after,
		before: j.data.before,
		items: j.data.children.filter((c: any) => c.kind === 't2').map((c: any) => parseUser(c.data))
	}));
}

// ---------- Users ----------

export async function getUser(name: string): Promise<Result<User>> {
	const r = await getJson<any>(`/user/${name}/about.json`);
	return map(r, (j) => parseUser(j.data));
}

export async function getUserOverviewListing(
	name: string,
	opts?: { limit?: number; after?: string; sort?: 'new' | 'hot' | 'top'; t?: TimeRange }
) {
	const r = await getJson<any>(`/user/${name}/overview.json`, defaults(opts));
	return map(r, parseUserOverview);
}

export async function getUserPosts(
	name: string,
	opts?: { limit?: number; after?: string; sort?: 'new' | 'hot' | 'top'; t?: TimeRange }
): Promise<Result<Listing<Post>>> {
	const r = await getJson<any>(`/user/${name}/submitted.json`, defaults(opts));
	return map(r, parsePostListing);
}

export async function getUserComments(
	name: string,
	opts?: { limit?: number; after?: string; sort?: 'new' | 'hot' | 'top'; t?: TimeRange }
): Promise<Result<Listing<CommentNode>>> {
	const r = await getJson<any>(`/user/${name}/comments.json`, defaults(opts));
	return map(r, (j) => ({
		after: j.data.after,
		before: j.data.before,
		items: j.data.children.map((c: any) => {
			// User comment listings are flat (no replies tree).
			return parseCommentListing({ data: { children: [c] } })[0];
		})
	}));
}
