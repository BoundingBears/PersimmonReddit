// Tiny global store for the navigation drawer's open state.
// Any TopAppBar's hamburger flips this; <NavDrawer /> in the root layout reads it.
//
// Drawer state is pure UI — it does NOT push a history entry. We let
// @capacitor/app's backButton listener intercept the Android back gesture /
// hardware back so a back press closes the drawer (when it's open) before
// falling through to normal navigation. Coupling drawer state to the history
// stack (the previous v1.0.2 design) caused desync between SvelteKit's
// navigation tracking and the WebView's actual back-stack — which broke
// `history.back()` from any route reached via the drawer.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { App } from '@capacitor/app';
import { IS_NATIVE } from '$lib/utils/platform';

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

// On Android: register a backButton listener so the back gesture closes the
// drawer when it's open, otherwise lets navigation proceed normally. On web,
// this is a no-op — the drawer's back-gesture-closes behavior is native-only.
export function installDrawerBackHandler(): () => void {
	if (!browser || !IS_NATIVE) return () => {};

	let removeFn: (() => void) | null = null;
	let cancelled = false;

	App.addListener('backButton', ({ canGoBack }) => {
		if (get(drawerOpen)) {
			drawerOpen.set(false);
		} else if (canGoBack) {
			window.history.back();
		} else {
			App.exitApp();
		}
	}).then((handle) => {
		if (cancelled) {
			handle.remove();
		} else {
			removeFn = () => handle.remove();
		}
	});

	return () => {
		cancelled = true;
		removeFn?.();
	};
}
