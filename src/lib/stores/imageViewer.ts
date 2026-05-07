// Tiny store for the global image viewer overlay. Any component can call
// `open(url)` to surface a fullscreen lightbox; <ImageViewer /> in the root
// layout reads it.
//
// The viewer also takes over the back gesture: opening pushes a marker
// history entry so a hardware/gesture back closes the viewer instead of
// navigating off the underlying page. Closing pops it cleanly.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type ViewerKind = 'image' | 'video';

export interface ViewerState {
	url: string;
	kind: ViewerKind;
	alt?: string;
}

export const viewerState = writable<ViewerState | null>(null);

const VIEWER_STATE_MARKER = { persimmonViewer: true };

function pushHistoryEntry() {
	if (!browser) return;
	// Use the same URL — we just want a marker entry the user can pop.
	history.pushState(VIEWER_STATE_MARKER, '', location.href);
}

function popHistoryEntry() {
	if (!browser) return;
	if (history.state && (history.state as { persimmonViewer?: boolean }).persimmonViewer) {
		history.back();
	}
}

function open(state: ViewerState) {
	const wasOpen = get(viewerState) !== null;
	viewerState.set(state);
	// Only push a new history marker on the open transition. If the viewer was
	// already open and the user is just swapping images, reuse the entry.
	if (!wasOpen) pushHistoryEntry();
}

export function openImage(url: string, alt?: string): void {
	open({ url, kind: 'image', alt });
}

export function openVideo(url: string, alt?: string): void {
	open({ url, kind: 'video', alt });
}

// Two close paths:
//   - User taps X / scrim: call closeViewer() — pops history (which fires
//     popstate and we'll handle it by clearing state).
//   - User does back gesture: popstate fires; the listener clears state.
// Both end up at viewerState = null with a clean back-stack.
export function closeViewer(): void {
	if (!browser) {
		viewerState.set(null);
		return;
	}
	if (history.state && (history.state as { persimmonViewer?: boolean }).persimmonViewer) {
		// Pop the entry — the popstate listener (in ImageViewer.svelte) clears state.
		history.back();
	} else {
		viewerState.set(null);
	}
}

export function installViewerHistoryListener(): () => void {
	if (!browser) return () => {};
	const onPop = () => {
		// If the popstate landed us at a state without our marker, we've
		// "left" the viewer — clear it.
		const isMarker = history.state && (history.state as { persimmonViewer?: boolean }).persimmonViewer;
		if (!isMarker && get(viewerState) !== null) {
			viewerState.set(null);
		}
	};
	window.addEventListener('popstate', onPop);
	return () => window.removeEventListener('popstate', onPop);
}
