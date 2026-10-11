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
	try {
		pushState(url, { postId: id });
		// afterNavigate does not fire for a shallow entry, so mirror it by hand.
		trackNavigation(url, 'link');
	} catch {
		// Router not ready, or mid-navigation: fall back to the page.
		void goto(url);
	}
}
