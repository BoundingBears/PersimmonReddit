// Module-level cache of feed state so back-navigation lands the user exactly
// where they were instead of refetching from scratch and snapping to top.
//
// Usage from a feed page:
//   - onMount(): try getFeedSnapshot(key); if hit, hydrate state and restore
//     scroll, skip the initial fetch.
//   - onDestroy(): saveFeedSnapshot(key, current state + window.scrollY).
//
// Lives in module scope so it survives Svelte component remounts. Lost on
// app process kill, which is the right tradeoff — fresh start, fresh data.

import type { CommentSort, Post, Sort } from '$lib/reddit/types';

export interface FeedSnapshot {
	posts: Post[];
	after: string | null;
	sort: Sort | CommentSort | string;
	scrollY: number;
}

const snapshots = new Map<string, FeedSnapshot>();

export function saveFeedSnapshot(key: string, snap: FeedSnapshot): void {
	snapshots.set(key, snap);
}

export function getFeedSnapshot(key: string): FeedSnapshot | undefined {
	return snapshots.get(key);
}

export function clearFeedSnapshot(key: string): void {
	snapshots.delete(key);
}
