// Locally-hidden post IDs. Port of Geddit's store.js (hide/unhide/is_hidden).
// Backed by @capacitor/preferences so it survives webview cache clears.

import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

const STORAGE_KEY = 'persimmon.hidden';

const internal = writable<Set<string>>(new Set());

export const hidden = {
	subscribe: internal.subscribe,
	hide(id: string): void {
		internal.update((s) => new Set(s).add(id));
	},
	unhide(id: string): void {
		internal.update((s) => {
			const next = new Set(s);
			next.delete(id);
			return next;
		});
	},
	clear(): void {
		internal.set(new Set());
	},
	isHidden(id: string, set: Set<string>): boolean {
		return set.has(id);
	}
};

let writePending = false;
async function loadHidden(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) {
			const arr = JSON.parse(value) as string[];
			internal.set(new Set(arr));
		}
	} catch {
		// fall through
	}
	internal.subscribe(async (s) => {
		if (writePending) return;
		writePending = true;
		try {
			await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify([...s]) });
		} finally {
			writePending = false;
		}
	});
}

export const hiddenReady = loadHidden();
