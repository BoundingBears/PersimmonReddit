// Tiny global store for the navigation drawer's open state.
// Any TopAppBar's hamburger flips this; <NavDrawer /> in the root layout reads it.
//
// Back-gesture handling is split per platform:
//   - Android: Capacitor `App.backButton` listener in installBackHandler.ts
//     intercepts the gesture and closes the drawer if it's open.
//   - iOS: no `App.backButton` event exists. Instead we push an iOS history
//     marker on open (see iosOverlay.ts) so the system swipe-from-left-edge
//     fires popstate, which the listener installed by NavDrawer.svelte
//     translates into "close the drawer."

import { get, writable } from 'svelte/store';
import { clearIOSOverlay, isIOS, popIOSOverlay, pushIOSOverlay } from '$lib/utils/iosOverlay';

export const drawerOpen = writable(false);
export const DRAWER_OVERLAY_KEY = 'drawer';

export function openDrawer(): void {
	if (get(drawerOpen)) return;
	drawerOpen.set(true);
	pushIOSOverlay(DRAWER_OVERLAY_KEY);
}

export function closeDrawer(): void {
	if (!get(drawerOpen)) return;
	if (isIOS()) {
		// Pops the marker; popstate listener (installed by NavDrawer) sets state.
		popIOSOverlay(DRAWER_OVERLAY_KEY);
	} else {
		drawerOpen.set(false);
	}
}

// Close-and-navigate variant for drawer rows that goto() somewhere. Clears
// the iOS marker via replaceState so the upcoming goto() pushes onto a
// marker-free entry, leaving a clean back-stack on iOS. No-op on Android.
export function dismissDrawerForNavigation(): void {
	if (!get(drawerOpen)) return;
	drawerOpen.set(false);
	clearIOSOverlay(DRAWER_OVERLAY_KEY);
}

export function toggleDrawer(): void {
	if (get(drawerOpen)) closeDrawer();
	else openDrawer();
}
