// The feed the user most recently opened a post from. The post-detail page
// reads it to power swiping left/right between adjacent posts.
//
// This used to be a push/pop stack of history entries — but nothing ever called
// pushEntry() or rememberScroll(), so the stack was permanently empty:
// setFeedContext() wrote into `stack[stack.length - 1]` (undefined, guarded by
// `if (top)`) and peekEntry() always returned null, which silently disabled
// swipe-between-posts entirely. A single current-context slot is all the
// feature needs and there's no way for it to fall out of sync.
//
// Per-feed scroll restoration lives in $lib/utils/scrollRestore.ts.

export interface FeedContext {
	// Ids of the posts visible in the feed when the user opened one, in order.
	feedItemIds: string[];
	after?: string | null;
	sort?: string;
	subreddit?: string;
}

let current: FeedContext | null = null;

export function setFeedContext(ctx: FeedContext): void {
	current = ctx;
}

export function getFeedContext(): FeedContext | null {
	return current;
}

export function clearFeedContext(): void {
	current = null;
}
