// Typed wrappers around Reddit's public JSON endpoints. One function per route.
// All return Result<T> — callers must handle the error case explicitly.

import { getJson, postForm } from './client';
import {
	parseCommentListing,
	parsePostListing,
	parseSubmissionAndComments,
	parseSubreddit,
	parseSubredditListing,
	parseUser,
	parseUserOverview
} from './parsers';
import type {
	CommentNode,
	CommentSort,
	Listing,
	Post,
	Result,
	Sort,
	Subreddit,
	TimeRange,
	User
} from './types';

const DEFAULT_LIMIT = 25;

function defaults(opts?: Record<string, string | number | boolean>) {
	// Spread instead of mutating a closure variable (Geddit's Object.assign bug).
	return { limit: DEFAULT_LIMIT, include_over_18: true, raw_json: 1, ...opts };
}

function map<T, U>(r: Result<T>, fn: (v: T) => U): Result<U> {
	return r.ok ? { ok: true, data: fn(r.data) } : r;
}

// ---------- Submissions ----------

export async function getSubmissions(
	sort: Sort = 'hot',
	subreddit?: string,
	opts?: { limit?: number; after?: string; t?: TimeRange }
): Promise<Result<Listing<Post>>> {
	const path = subreddit ? `/r/${subreddit}/${sort}.json` : `/${sort}.json`;
	const r = await getJson<any>(path, defaults(opts));
	return map(r, parsePostListing);
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
	const failures: string[] = [];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		if (r.ok) {
			// Drop stickied posts from merged feeds — they're useful on an
			// individual sub's page (mod announcements specific to that sub),
			// but in a round-robin merge across N subs they pile up at the
			// top as weeks-old noise.
			lists.push(r.data.items.filter((p) => !p.stickied));
		} else {
			failures.push(subs[i]);
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

	if (failures.length === subs.length) {
		return { ok: false, error: { message: `all ${subs.length} subs failed` } };
	}
	return { ok: true, data: { after: null, before: null, items: deduped } };
}

export async function getSubmission(id: string): Promise<Result<Post>> {
	const r = await getJson<any>(`/by_id/t3_${id}.json`);
	return map(r, (json) => parsePostListing(json).items[0]);
}

export async function getSubmissionComments(
	id: string,
	opts?: { sort?: CommentSort; limit?: number; depth?: number }
): Promise<Result<{ post: Post; comments: CommentNode[] }>> {
	const r = await getJson<any>(`/comments/${id}.json`, defaults(opts));
	return map(r, parseSubmissionAndComments);
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
		const r = await getJson<any>('/api/info.json', { id: chunk.join(','), raw_json: 1 });
		if (!r.ok) return r;
		parsed.push(...parseCommentListing(r.data));
	}
	return { ok: true, data: parsed };
}

// ---------- Subreddits ----------

export async function getSubreddit(name: string): Promise<Result<Subreddit>> {
	const r = await getJson<any>(`/r/${name}/about.json`);
	return map(r, (j) => parseSubreddit(j.data));
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
