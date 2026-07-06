// Silent auto-backup. Uninstalling the app wipes its private storage (this is
// how a user's subs/saved/prefs can vanish), so when enabled we write a full
// backup to the public Documents folder — which survives uninstall and can be
// re-imported from Settings afterwards. Written when the app is backgrounded,
// by which point every store has hydrated, so it always captures live state.
//
// The write is gated on hydration completing: without that, a write triggered
// during the brief async load window would overwrite a good backup with empty
// pre-hydration state.

import { get } from 'svelte/store';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { browser } from '$app/environment';
import { IS_NATIVE } from '$lib/utils/platform';
import { prefs } from '$lib/stores/prefs';
import { serializeBackup, AUTO_BACKUP_FILENAME } from '$lib/utils/backup';
import { subscribedReady } from '$lib/stores/subscribed';
import { savedReady } from '$lib/stores/saved';
import { hiddenReady } from '$lib/stores/hidden';
import { readPostsReady } from '$lib/stores/readPosts';
import { filtersReady } from '$lib/stores/filters';
import { subSortReady } from '$lib/stores/subSort';
import { groupsReady } from '$lib/stores/groups';

const AUTO_BACKUP_PATH = `Persimmon/${AUTO_BACKUP_FILENAME}`;

let hydrated = false;
let writing = false;

export async function writeAutoBackup(): Promise<boolean> {
	if (!IS_NATIVE || !hydrated || writing) return false;
	if (!get(prefs).autoBackup) return false;
	writing = true;
	try {
		await Filesystem.writeFile({
			path: AUTO_BACKUP_PATH,
			data: serializeBackup(),
			directory: Directory.Documents,
			encoding: Encoding.UTF8,
			recursive: true
		});
		return true;
	} catch (e) {
		console.error('auto-backup write failed', e);
		return false;
	} finally {
		writing = false;
	}
}

// Wire up the background triggers. Returns a cleanup function for onMount.
export function startAutoBackup(): () => void {
	if (!browser || !IS_NATIVE) return () => {};

	// Only allow writes once every backed-up store has loaded.
	Promise.all([
		prefs.ready,
		subscribedReady,
		savedReady,
		hiddenReady,
		readPostsReady,
		filtersReady,
		subSortReady,
		groupsReady
	]).then(() => {
		hydrated = true;
	});

	const onHide = () => {
		if (document.visibilityState === 'hidden') void writeAutoBackup();
	};
	document.addEventListener('visibilitychange', onHide);
	window.addEventListener('pagehide', onHide);
	return () => {
		document.removeEventListener('visibilitychange', onHide);
		window.removeEventListener('pagehide', onHide);
	};
}
