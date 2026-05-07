// Lightweight back-stack + scroll-restore. SvelteKit's built-in scroll restore
// is page-level; we want per-feed scroll position so navigating into a post
// and back lands the user where they were.

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface Entry {
	path: string;
	scrollY: number;
	feedItemIds?: string[]; // ids of posts in the feed when the user opened a post
	feedCursor?: { after?: string | null; sort?: string; subreddit?: string };
}

const stack: Entry[] = [];

export const lastEntry = writable<Entry | null>(null);

export function pushEntry(entry: Entry): void {
	stack.push(entry);
	lastEntry.set(entry);
}

export function popEntry(): Entry | null {
	const e = stack.pop() ?? null;
	lastEntry.set(stack[stack.length - 1] ?? null);
	return e;
}

export function peekEntry(): Entry | null {
	return stack[stack.length - 1] ?? null;
}

export function rememberScroll(path: string): void {
	if (!browser) return;
	const top = stack[stack.length - 1];
	if (top && top.path === path) {
		top.scrollY = window.scrollY;
	} else {
		pushEntry({ path, scrollY: window.scrollY });
	}
}

export function restoreScroll(path: string): void {
	if (!browser) return;
	const top = stack[stack.length - 1];
	if (top?.path === path) {
		// Defer until layout is committed.
		requestAnimationFrame(() => window.scrollTo({ top: top.scrollY, behavior: 'instant' as ScrollBehavior }));
	}
}

// Used by post-detail swipe-between-posts. The feed page sets the cursor when
// the user opens a post; the post page reads it to know what's next/prev.
export function setFeedContext(ctx: NonNullable<Entry['feedCursor']> & { feedItemIds: string[] }): void {
	const top = stack[stack.length - 1];
	if (top) {
		top.feedCursor = { after: ctx.after, sort: ctx.sort, subreddit: ctx.subreddit };
		top.feedItemIds = ctx.feedItemIds;
	}
}
