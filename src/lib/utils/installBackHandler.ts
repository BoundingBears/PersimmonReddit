// Centralized Android back-gesture handler. Installed once in +layout.svelte.
// All overlay components (post action sheet, drawer, image viewer) share
// this single Capacitor `App.backButton` listener instead of registering
// their own — that way exactly one decision happens per back press, with no
// races between independent listeners.
//
// Priority order (top-most overlay wins):
//   1. Post action sheet
//   2. Drawer
//   3. Image viewer (delegates to closeViewer which handles its history marker)
//   4. Default — window.history.back() if there's history, else exit the app

import { App } from '@capacitor/app';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { postActionsState } from '$lib/stores/postActions';
import { whatsNewOpen } from '$lib/stores/whatsNew';
import { subredditInfoState } from '$lib/stores/subredditInfo';
import { feedEditState } from '$lib/stores/feedEdit';
import { drawerOpen } from '$lib/stores/drawer';
import { viewerState, closeViewer } from '$lib/stores/imageViewer';
import { IS_NATIVE } from './platform';

export function installBackHandler(): () => void {
	if (!browser || !IS_NATIVE) return () => {};

	let removeFn: (() => void) | null = null;
	let cancelled = false;

	App.addListener('backButton', ({ canGoBack }) => {
		if (get(postActionsState)) {
			postActionsState.set(null);
			return;
		}
		if (get(whatsNewOpen)) {
			whatsNewOpen.set(false);
			return;
		}
		if (get(subredditInfoState)) {
			subredditInfoState.set(null);
			return;
		}
		// Feed editor sits above the drawer (it opens from it), so close it first.
		if (get(feedEditState)) {
			feedEditState.set(null);
			return;
		}
		if (get(drawerOpen)) {
			drawerOpen.set(false);
			return;
		}
		if (get(viewerState)) {
			// ImageViewer pushes a history marker on open; closeViewer
			// pops it cleanly via history.back so the back-stack stays clean.
			closeViewer();
			return;
		}
		if (canGoBack) {
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
