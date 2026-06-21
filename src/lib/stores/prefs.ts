// Persisted user preferences. Backed by @capacitor/preferences which uses
// localStorage in the web build and AndroidX SharedPreferences on Android.

import { writable, type Writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import type { CommentSort, Sort } from '$lib/reddit/types';

export type ThemeName = 'dark' | 'light' | 'amoled' | 'cream' | 'slate' | 'sunset' | 'twilight';
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
	markPostsRead: boolean; // grey out titles of posts you've opened
	hideReadPosts: boolean; // also drop opened posts from feeds (needs markPostsRead)
	uaEscalationEnabled: boolean; // try alternate User-Agents when Reddit blocks us
	feedCacheTtlHours: number; // age-out for the persistent last-good feed cache
	lastSeenVersion: string; // app version the user last saw the What's New sheet for
	fontScale: number; // reading-text size multiplier (0.8–1.5)
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
	haptics: true,
	markPostsRead: true,
	hideReadPosts: false,
	uaEscalationEnabled: true,
	feedCacheTtlHours: 24,
	lastSeenVersion: '',
	fontScale: 1
};

const STORAGE_KEY = 'persimmon.prefs';

function createPrefs(): Writable<Prefs> & {
	ready: Promise<void>;
	reset: () => void;
	flush: () => Promise<void>;
} {
	const store = writable<Prefs>(DEFAULT_PREFS);

	// Trailing debounce: sliders (e.g. fontScale) fire many updates per drag,
	// and each write flushes the whole object to SharedPreferences. Coalesce
	// bursts into one write ~200ms after the last change. flush() forces the
	// pending write out immediately — for one-shot state that must survive a
	// quick app-kill (e.g. marking the What's New version seen).
	let writeTimer: ReturnType<typeof setTimeout> | null = null;
	let latest = DEFAULT_PREFS;
	async function flush(): Promise<void> {
		if (writeTimer) {
			clearTimeout(writeTimer);
			writeTimer = null;
		}
		if (!browser) return;
		try {
			await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(latest) });
		} catch {
			// ignore — preferences write failures are non-fatal
		}
	}

	const ready = (async () => {
		if (!browser) return;
		try {
			const { value } = await Preferences.get({ key: STORAGE_KEY });
			if (value) {
				const parsed = JSON.parse(value) as Record<string, unknown>;
				// Theme migrations: pre-release rename + removed themes.
				if (parsed.theme === 'dracula') parsed.theme = 'slate';
				else if (parsed.theme === 'nord') parsed.theme = 'dark';
				store.set({ ...DEFAULT_PREFS, ...(parsed as Partial<Prefs>) });
			}
		} catch {
			// fall through to defaults
		}
		store.subscribe((v) => {
			latest = v;
			if (writeTimer) clearTimeout(writeTimer);
			writeTimer = setTimeout(flush, 200);
		});
	})();

	return {
		...store,
		ready,
		reset: () => store.set({ ...DEFAULT_PREFS }),
		flush
	};
}

export const prefs = createPrefs();
