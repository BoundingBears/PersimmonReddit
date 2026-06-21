// Overlay store for the "create / edit custom feed" bottom sheet, opened from
// the nav drawer. Mirrors postActions.ts: Android back is handled centrally in
// installBackHandler.ts; iOS uses a history marker (iosOverlay.ts) caught by a
// popstate listener in FeedEditSheet.svelte.

import { get, writable } from 'svelte/store';
import { clearIOSOverlay, isIOS, popIOSOverlay, pushIOSOverlay } from '$lib/utils/iosOverlay';

// null = closed. { name: null } = creating a new feed. { name: 'X' } = editing X.
export interface FeedEditState {
	name: string | null;
}

export const feedEditState = writable<FeedEditState | null>(null);
export const FEED_EDIT_OVERLAY_KEY = 'feedEdit';

export function openFeedEdit(name: string | null): void {
	if (get(feedEditState)) return;
	feedEditState.set({ name });
	pushIOSOverlay(FEED_EDIT_OVERLAY_KEY);
}

export function closeFeedEdit(): void {
	if (!get(feedEditState)) return;
	if (isIOS()) {
		// Pops the marker; popstate listener in FeedEditSheet.svelte clears state.
		popIOSOverlay(FEED_EDIT_OVERLAY_KEY);
	} else {
		feedEditState.set(null);
	}
}

// Close-and-navigate variant (used after creating a feed, which goto()s into
// it). Clears the iOS marker via replaceState so the upcoming goto() lands on
// a marker-free entry. No-op on Android.
export function dismissFeedEditForNavigation(): void {
	if (!get(feedEditState)) return;
	feedEditState.set(null);
	clearIOSOverlay(FEED_EDIT_OVERLAY_KEY);
}
