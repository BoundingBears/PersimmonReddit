// Overlay store for the "What's New" sheet. Mirrors postActions.ts: an
// in-memory open/closed flag plus iOS history-marker handling. Persistence of
// "has the user seen this version" lives in prefs.lastSeenVersion, not here.

import { get, writable } from 'svelte/store';
import { clearIOSOverlay, isIOS, popIOSOverlay, pushIOSOverlay } from '$lib/utils/iosOverlay';
import { prefs } from '$lib/stores/prefs';

export const whatsNewOpen = writable(false);
export const WHATS_NEW_OVERLAY_KEY = 'whatsNew';

export function openWhatsNew(): void {
	if (get(whatsNewOpen)) return;
	whatsNewOpen.set(true);
	pushIOSOverlay(WHATS_NEW_OVERLAY_KEY);
}

export function closeWhatsNew(): void {
	if (!get(whatsNewOpen)) return;
	if (isIOS()) {
		popIOSOverlay(WHATS_NEW_OVERLAY_KEY);
	} else {
		whatsNewOpen.set(false);
	}
}

// Called once after prefs hydrate (from +layout). Shows the sheet when the
// installed version differs from the last one the user saw. We persist
// lastSeenVersion *on open* so any dismissal path (tap, back, swipe, app kill)
// won't re-trigger it; the user can always re-open it from Settings.
export function openWhatsNewIfUpdated(): void {
	const seen = get(prefs).lastSeenVersion;
	if (__APP_VERSION__ === seen) return;
	prefs.update((p) => ({ ...p, lastSeenVersion: __APP_VERSION__ }));
	// Persist immediately (not on the 200ms debounce) so killing the app right
	// after launch — e.g. during a slow cold start — can't lose the write and
	// re-show the sheet next launch.
	void prefs.flush();
	openWhatsNew();
}
