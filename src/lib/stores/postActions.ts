// Tiny store for the long-press post action sheet.
//
// Back-gesture handling is split per platform:
//   - Android: Capacitor `App.backButton` listener in installBackHandler.ts
//     intercepts the gesture and closes the sheet if open.
//   - iOS: no `App.backButton` event exists. We push an iOS history marker
//     on open (see iosOverlay.ts); the popstate fired by iOS's
//     swipe-from-left-edge is caught by a listener installed in
//     PostActionSheet.svelte's onMount, which clears the state.

import { get, writable } from 'svelte/store';
import { clearIOSOverlay, isIOS, popIOSOverlay, pushIOSOverlay } from '$lib/utils/iosOverlay';
import type { Post } from '$lib/reddit/types';

export interface PostActionsState {
	post: Post;
}

export const postActionsState = writable<PostActionsState | null>(null);
export const POST_ACTIONS_OVERLAY_KEY = 'postSheet';

export function openPostActions(post: Post): void {
	if (get(postActionsState)) return;
	postActionsState.set({ post });
	pushIOSOverlay(POST_ACTIONS_OVERLAY_KEY);
}

export function closePostActions(): void {
	if (!get(postActionsState)) return;
	if (isIOS()) {
		// Pops the marker; popstate listener in PostActionSheet.svelte sets state.
		popIOSOverlay(POST_ACTIONS_OVERLAY_KEY);
	} else {
		postActionsState.set(null);
	}
}

// Close-and-navigate variant for action handlers that goto() somewhere
// (Open author / Open subreddit). Clears the iOS marker via replaceState
// so the upcoming goto() pushes onto a marker-free entry, leaving a clean
// back-stack on iOS. No-op on Android.
export function dismissPostActionsForNavigation(): void {
	if (!get(postActionsState)) return;
	postActionsState.set(null);
	clearIOSOverlay(POST_ACTIONS_OVERLAY_KEY);
}
