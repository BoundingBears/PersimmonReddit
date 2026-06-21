// iOS-specific helpers for "back-gesture closes overlay" behavior.
//
// Why iOS needs different machinery than Android:
//   On Android we use Capacitor's `App.backButton` listener (see
//   installBackHandler.ts) — it fires for the gesture/hardware back and lets
//   us close drawer/sheet/viewer in priority order before falling through.
//   That listener doesn't exist on iOS. Instead, iOS WKWebView fires a
//   normal `popstate` event when the user swipes-from-left-edge, the same
//   way browser back does on web.
//
// So on iOS we use the classic history-marker pattern (same one
// imageViewer.ts has used since v1.0.x): push a marker history entry when
// the overlay opens, listen for popstate to detect when the marker is
// popped (= user swiped back), and close the overlay then. Programmatic
// close calls `history.back()` to pop the marker which fires the same
// popstate path. Navigation away (e.g. drawer row tapped to open a sub)
// uses `history.replaceState` to clear the marker without a back nav, then
// `goto` pushes the destination on top — clean back-stack.
//
// All functions are no-ops on Android and web — safe to call unconditionally.

import { Capacitor } from '@capacitor/core';
import { browser } from '$app/environment';

interface OverlayMarker {
	persimmonOverlay: string;
}

export function isIOS(): boolean {
	return browser && Capacitor.getPlatform() === 'ios';
}

export function pushIOSOverlay(key: string): void {
	if (!isIOS()) return;
	history.pushState({ persimmonOverlay: key } as OverlayMarker, '', location.href);
}

// Pop the marker if it's the current top entry. Used when the overlay is
// being dismissed back to where the user was before opening it.
export function popIOSOverlay(key: string): void {
	if (!isIOS()) return;
	const state = history.state as OverlayMarker | null;
	if (state?.persimmonOverlay === key) {
		history.back();
	}
}

// Clear the marker without popping (replace its state with null). Used
// when the overlay is being closed in preparation for navigating elsewhere
// — the next `goto()` will push a new entry on top, leaving a clean
// `[origin, destination]` back-stack instead of `[origin, marker, destination]`.
export function clearIOSOverlay(key: string): void {
	if (!isIOS()) return;
	const state = history.state as OverlayMarker | null;
	if (state?.persimmonOverlay === key) {
		history.replaceState(null, '', location.href);
	}
}

// Install a popstate listener that calls `onClose` whenever the user
// navigates away from this overlay's marker (typically via swipe-back).
// `isOpen` is checked so we don't fire the close callback for unrelated
// pop events (e.g. ordinary back navigation while no overlay is open).
//
// Returns a cleanup function suitable for `onMount` return.
export function installIOSOverlayPopstate(
	key: string,
	isOpen: () => boolean,
	onClose: () => void
): () => void {
	if (!isIOS()) return () => {};
	const onPop = () => {
		if (!isOpen()) return;
		const state = history.state as OverlayMarker | null;
		if (state?.persimmonOverlay !== key) onClose();
	};
	window.addEventListener('popstate', onPop);
	return () => window.removeEventListener('popstate', onPop);
}
