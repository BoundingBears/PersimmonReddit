// Opening a post from a list (a feed, search results, a profile, saved posts).
//
// The post is not a navigation. It is shown in a layer over the list, which
// stays mounted and scrolled exactly where it was, so going back is nothing
// more than removing the layer: no rebuilding the feed, no restoring a scroll
// position. SvelteKit calls this shallow routing: the URL and the history
// entry are real (/comments/<id>, and Back works), but the page underneath
// does not change. +layout.svelte renders the layer from page.state.postId.
//
// The real /comments/[id] route still exists for everything that is not a tap
// on a list: links from a browser, a post opened from inside another post, and
// the session being rebuilt after the app was killed.

import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto, pushState } from '$app/navigation';
import { page } from '$app/stores';
import { trackNavigation } from './session';
import type { Post } from '$lib/reddit/types';

// What the list already knows about a post, so the layer can draw the title
// and media the instant it opens instead of waiting for the comments request.
const seeds = new Map<string, Post>();
const MAX_SEEDS = 40;

export function seedFor(id: string): Post | undefined {
	return seeds.get(id);
}

export function openPost(id: string, seed?: Post): void {
	if (seed) {
		seeds.delete(id);
		seeds.set(id, seed);
		if (seeds.size > MAX_SEEDS) seeds.delete(seeds.keys().next().value as string);
	}
	const url = `/comments/${id}`;
	// One layer at a time. A post opened from inside a post is a plain page.
	if (get(page).state.postId) {
		void goto(url);
		return;
	}
	// Before the layer covers it: where the tapped card sits on screen.
	const card = cardOf(id);
	const top = card ? card.getBoundingClientRect().top : null;
	try {
		pushState(url, { postId: id });
		// afterNavigate does not fire for a shallow entry, so mirror it by hand.
		trackNavigation(url, 'link');
		opened = { id, top };
		watchBack();
		current = history.state as Entry;
	} catch {
		// Router not ready, or mid-navigation: fall back to the page.
		void goto(url);
	}
}

// ---- Back puts the list exactly where it was ----
//
// "No restoring a scroll position" above is the intent, but SvelteKit does
// restore one: it notes the window's offset when the layer opens and scrolls
// the window to that number when the layer closes. The number is only right
// if the list has not changed in between, and the list is alive under the
// layer. A page of posts fails to load and a line of text appears; cards are
// still being mounted above the view after the list was rebuilt; a read post
// is hidden. The browser keeps the visible posts where they are through all
// of that by moving the offset itself (scroll anchoring), so when Back is
// pressed the window is already right and the remembered number is stale.
// Measured: one failed "load more" while a post was open left the feed 63 px
// off on Back, and a list still filling in above can be off by screens.
//
// So the window's real offset is read just before SvelteKit handles Back and
// put back just after, and then the card that was tapped is lined up with
// where it was when it was tapped, which is what "the same spot" means.

// SvelteKit's stamp on a history entry.
type Entry = { 'sveltekit:navigation'?: number; 'sveltekit:states'?: { postId?: string } } | null;

let opened: { id: string; top: number | null } | null = null;
// The entry the user is on, as far as layers are concerned.
let current: Entry = null;
let closing: { y: number } | null = null;

/** A real navigation finished (the layout's afterNavigate): note the entry it landed on. */
export function noteNavigation(): void {
	if (browser) current = history.state as Entry;
}

function cardOf(id: string): HTMLElement | null {
	if (!browser) return null;
	const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
	return document.querySelector<HTMLElement>(`main [data-post-id="${safe}"]`);
}

function beforeBack(event: PopStateEvent) {
	const to = event.state as Entry;
	const layerNow = current?.['sveltekit:states']?.postId;
	// The layer coming off its own list: same page underneath, no post in the
	// entry being returned to. Anything else is a navigation, and not ours.
	const sameList = !!to && to['sveltekit:navigation'] === current?.['sveltekit:navigation'];
	closing = layerNow && sameList && !to?.['sveltekit:states']?.postId ? { y: window.scrollY } : null;
}

function afterBack(event: PopStateEvent) {
	const was = closing;
	const post = current?.['sveltekit:states']?.postId;
	closing = null;
	// Only entries SvelteKit made. The image viewer pushes a bare marker of
	// its own while a post is open; closing it comes back here to the post.
	if ((event.state as Entry)?.['sveltekit:navigation'] !== undefined) current = event.state as Entry;
	if (!was) return;
	const instant = 'instant' as ScrollBehavior;
	if (Math.abs(window.scrollY - was.y) > 0.5) window.scrollTo({ top: was.y, behavior: instant });
	const tapped = opened && opened.id === post ? opened : null;
	opened = null;
	if (!tapped || tapped.top === null) return;
	const card = cardOf(tapped.id);
	if (!card) return; // hidden as read, or filtered out, while it was open
	const moved = card.getBoundingClientRect().top - tapped.top;
	if (Math.abs(moved) > 0.5) window.scrollBy({ top: moved, behavior: instant });
}

// Listeners on the same target run in the order they were added, capturing
// ones first. SvelteKit adds its popstate listener when the router starts,
// long before the first post is opened, so `beforeBack` (capturing) runs
// ahead of it and `afterBack` behind it, in the same turn of the event loop:
// nothing is painted in between.
let watching = false;
function watchBack() {
	if (watching || !browser) return;
	watching = true;
	window.addEventListener('popstate', beforeBack, { capture: true });
	window.addEventListener('popstate', afterBack);
}
