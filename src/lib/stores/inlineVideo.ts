// The one video playing inside a feed card, by post id, or null.
//
// Tapping play on a card plays its video right there (PostCard.svelte).
// Keeping the id here, not in each card, is what makes it one at a time:
// starting another card's video moves the id and the first card goes back to
// its picture. Anything that takes the feed out of view clears it: opening a
// post (postLayer.ts), leaving the page, the app going to the background, or
// the card scrolling away.

import { writable } from 'svelte/store';

export const inlineVideo = writable<string | null>(null);

export function stopInlineVideo(): void {
	inlineVideo.set(null);
}
