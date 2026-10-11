// Module-level cache of feed state so back-navigation lands the user exactly
// where they were instead of refetching from scratch and snapping to top.
//
// Usage from a feed page:
//   - at construction: getFeedSnapshot(key); if hit, hydrate state, skip the
//     initial fetch, and restore the scroll anchor.
//   - beforeNavigate: saveFeedSnapshot(key, current state + scroll anchor).
//
// Lives in module scope so it survives Svelte component remounts. It is also
// written through to storage by session.ts, so it survives the app being
// killed in the background: on the next launch the map below starts out
// pre-filled with the feeds from the visit that was interrupted.

import type { CommentSort, Post, Sort } from '$lib/reddit/types';
import type { ScrollAnchor } from '$lib/utils/scrollRestore';
import { isReplaying, restoredFeeds, setFeedsProvider } from './session';

export interface FeedSnapshot extends ScrollAnchor {
	posts: Post[];
	after: string | null;
	sort: Sort | CommentSort | string;
}

// Insertion order doubles as recency: a save moves its key to the end, so the
// tail of the map is what session.ts keeps when it has to choose.
const snapshots = new Map<string, FeedSnapshot>(restoredFeeds());

setFeedsProvider(() => [...snapshots.entries()]);

export function saveFeedSnapshot(key: string, snap: FeedSnapshot): void {
	// While the back stack is being replayed after a restart, feed pages mount
	// for an instant and are navigated away from before fonts and images have
	// laid out. A capture taken then is a wrong position, and it would
	// overwrite the right one that was just restored from storage.
	if (isReplaying()) return;
	snapshots.delete(key);
	snapshots.set(key, snap);
}

export function getFeedSnapshot(key: string): FeedSnapshot | undefined {
	return snapshots.get(key);
}

export function clearFeedSnapshot(key: string): void {
	snapshots.delete(key);
}
