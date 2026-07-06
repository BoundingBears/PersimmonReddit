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

export interface ViewerItem {
	url: string;
	kind: ViewerKind;
	alt?: string;
	caption?: string;
}

// The viewer holds a list of items and the index currently shown. Single-image
// and single-video opens are just a one-item list, so gallery support is the
// general case and the old call sites (openImage/openVideo) are thin wrappers.
export interface ViewerState {
	items: ViewerItem[];
	index: number;
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
	open({ items: [{ url, kind: 'image', alt }], index: 0 });
}

export function openVideo(url: string, alt?: string): void {
	open({ items: [{ url, kind: 'video', alt }], index: 0 });
}

export function openGallery(items: ViewerItem[], startIndex = 0): void {
	if (items.length === 0) return;
	const index = Math.max(0, Math.min(startIndex, items.length - 1));
	open({ items, index });
}

// Swap the shown item WITHOUT touching history (only the open/close transitions
// push/pop the back-stack marker). Clamps, so a swipe past either end is a no-op
// the caller can treat as a rubber-band edge.
export function setViewerIndex(next: number): void {
	viewerState.update((s) => {
		if (!s) return s;
		const index = Math.max(0, Math.min(next, s.items.length - 1));
		return index === s.index ? s : { ...s, index };
	});
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
