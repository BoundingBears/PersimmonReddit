// Tiny store for the long-press post action sheet. State-only (no history
// manipulation). Back-gesture closing is handled centrally by the Capacitor
// `App.backButton` listener installed in +layout.svelte — same pattern the
// drawer uses (since v1.0.3). Doing it that way avoids the SvelteKit /
// history-marker desync that broke navigation in earlier attempts.

import { writable } from 'svelte/store';
import type { Post } from '$lib/reddit/types';

export interface PostActionsState {
	post: Post;
}

export const postActionsState = writable<PostActionsState | null>(null);

export function openPostActions(post: Post): void {
	postActionsState.set({ post });
}

export function closePostActions(): void {
	postActionsState.set(null);
}
