// Tiny global store for the navigation drawer's open state.
// Any TopAppBar's hamburger flips this; <NavDrawer /> in the root layout reads it.
//
// The drawer also takes over the back gesture: opening pushes a marker
// history entry so a hardware/gesture back closes the drawer instead of
// navigating off the underlying page (mirrors imageViewer.ts's approach).

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export const drawerOpen = writable(false);

const DRAWER_MARKER = { persimmonDrawer: true };

function isMarkerState(): boolean {
	return browser && !!history.state && (history.state as { persimmonDrawer?: boolean }).persimmonDrawer === true;
}

function pushHistoryEntry() {
	if (!browser) return;
	history.pushState(DRAWER_MARKER, '', location.href);
}

export function openDrawer(): void {
	if (get(drawerOpen)) return;
	drawerOpen.set(true);
	pushHistoryEntry();
}

// Standard close: X button, scrim tap, or programmatic close. Pops the marker
// entry so the back-stack stays clean — popstate listener will flip the state.
export function closeDrawer(): void {
	if (!get(drawerOpen)) return;
	if (isMarkerState()) {
		history.back();
	} else {
		drawerOpen.set(false);
	}
}

// Close-and-navigate: caller is about to push a new route. Don't pop the
// marker (it'll race with the navigation); just clear visual state and let
// the navigation use replaceState to overwrite the marker entry.
export function dismissDrawerForNavigation(): void {
	if (!get(drawerOpen)) return;
	drawerOpen.set(false);
}

export function toggleDrawer(): void {
	if (get(drawerOpen)) closeDrawer();
	else openDrawer();
}

// Listens for the back gesture / hardware back. When the user pops away from
// the marker entry (i.e. closes the drawer via gesture), flip drawerOpen so
// the out-transition runs.
export function installDrawerHistoryListener(): () => void {
	if (!browser) return () => {};
	const onPop = () => {
		if (!isMarkerState() && get(drawerOpen)) {
			drawerOpen.set(false);
		}
	};
	window.addEventListener('popstate', onPop);
	return () => window.removeEventListener('popstate', onPop);
}
