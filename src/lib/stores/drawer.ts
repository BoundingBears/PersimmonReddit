// Tiny global store for the navigation drawer's open state.
// Any TopAppBar's hamburger flips this; <NavDrawer /> in the root layout reads it.
//
// Drawer state is pure UI — no history manipulation. The Android back-gesture
// behavior (back closes the drawer when open, otherwise navigates) is handled
// centrally by the Capacitor `App.backButton` listener in +layout.svelte
// alongside the post-action-sheet and image-viewer overlays.

import { writable } from 'svelte/store';

export const drawerOpen = writable(false);

export function openDrawer(): void {
	drawerOpen.set(true);
}

export function closeDrawer(): void {
	drawerOpen.set(false);
}

export function toggleDrawer(): void {
	drawerOpen.update((v) => !v);
}
