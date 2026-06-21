// Overlay store for the subreddit info sheet (description + rules). Mirrors
// postActions.ts: in-memory open state + iOS history-marker handling. The about
// and rules data is fetched on-demand by the sheet and never persisted.

import { get, writable } from 'svelte/store';
import { clearIOSOverlay, isIOS, popIOSOverlay, pushIOSOverlay } from '$lib/utils/iosOverlay';

export interface SubredditInfoState {
	sub: string;
}

export const subredditInfoState = writable<SubredditInfoState | null>(null);
export const SUBREDDIT_INFO_OVERLAY_KEY = 'subredditInfo';

export function openSubredditInfo(sub: string): void {
	if (get(subredditInfoState)) return;
	subredditInfoState.set({ sub });
	pushIOSOverlay(SUBREDDIT_INFO_OVERLAY_KEY);
}

export function closeSubredditInfo(): void {
	if (!get(subredditInfoState)) return;
	if (isIOS()) {
		popIOSOverlay(SUBREDDIT_INFO_OVERLAY_KEY);
	} else {
		subredditInfoState.set(null);
	}
}

export function dismissSubredditInfoForNavigation(): void {
	if (!get(subredditInfoState)) return;
	subredditInfoState.set(null);
	clearIOSOverlay(SUBREDDIT_INFO_OVERLAY_KEY);
}
