// Persisted user preferences. Backed by @capacitor/preferences which uses
// localStorage in the web build and AndroidX SharedPreferences on Android.

import { writable, type Writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import type { CommentSort, Sort } from '$lib/reddit/types';

export type ThemeName = 'dark' | 'light' | 'amoled';
export type Layout = 'card' | 'compact' | 'gallery';
// Home page can show Reddit's front-page sorted (hot/new/top/rising) OR the
// user's merged subscribed feed. 'subscribed' is the source-toggle option
// folded into the same dropdown for simplicity.
export type HomeView = Sort | 'subscribed';

export interface Prefs {
	theme: ThemeName;
	accent: string; // hex like '#d0bcff'
	layout: Layout;
	defaultSort: Sort;
	defaultCommentSort: CommentSort;
	homeView: HomeView; // remembered across launches
	showNsfw: boolean;
	blurNsfw: boolean;
	lazyMode: boolean;
	lazyModePxPerSec: number;
	autoplayVideos: boolean;
	openLinksInBrowser: boolean; // vs in-app webview
	haptics: boolean;
}

export const DEFAULT_PREFS: Prefs = {
	theme: 'dark',
	accent: '#d0bcff',
	layout: 'card',
	defaultSort: 'hot',
	defaultCommentSort: 'best',
	homeView: 'hot',
	showNsfw: false,
	blurNsfw: true,
	lazyMode: false,
	lazyModePxPerSec: 60,
	autoplayVideos: false,
	openLinksInBrowser: true,
	haptics: true
};

const STORAGE_KEY = 'persimmon.prefs';

function createPrefs(): Writable<Prefs> & { ready: Promise<void>; reset: () => void } {
	const store = writable<Prefs>(DEFAULT_PREFS);

	const ready = (async () => {
		if (!browser) return;
		try {
			const { value } = await Preferences.get({ key: STORAGE_KEY });
			if (value) {
				const parsed = JSON.parse(value) as Partial<Prefs>;
				store.set({ ...DEFAULT_PREFS, ...parsed });
			}
		} catch {
			// fall through to defaults
		}
		store.subscribe(async (v) => {
			try {
				await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(v) });
			} catch {
				// ignore — preferences write failures are non-fatal
			}
		});
	})();

	return {
		...store,
		ready,
		reset: () => store.set({ ...DEFAULT_PREFS })
	};
}

export const prefs = createPrefs();
