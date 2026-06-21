// Per-subreddit sort memory: remembers the last sort you used on each subreddit
// (r/news -> new, r/art -> top) and restores it on revisit. Backed by
// @capacitor/preferences so it survives webview cache clears.
//
// Storage is a Map<subLower, {sort, usedAt}>; usedAt drives a soft LRU cap so a
// heavy browser can't grow the key unbounded. The entry is an object (not a bare
// sort string) to leave room for a future optional TimeRange without a migration.

import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import type { Sort } from '$lib/reddit/types';

export interface SubSortEntry {
	sort: Sort;
	usedAt: number;
}

const STORAGE_KEY = 'persimmon.subsort';
const MAX_ENTRIES = 1000;
const EVICT_BATCH = 200;

const internal = writable<Map<string, SubSortEntry>>(new Map());

function evictIfNeeded(m: Map<string, SubSortEntry>): Map<string, SubSortEntry> {
	if (m.size <= MAX_ENTRIES) return m;
	const sorted = [...m.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
	return new Map(sorted.slice(EVICT_BATCH));
}

export const subSort = {
	subscribe: internal.subscribe,
	// Non-reactive read — callers derive sort at navigation time, not reactively.
	get(sub: string): Sort | undefined {
		return get(internal).get(sub.toLowerCase())?.sort;
	},
	set(sub: string, sort: Sort): void {
		internal.update((m) => {
			const next = new Map(m);
			next.set(sub.toLowerCase(), { sort, usedAt: Date.now() });
			return evictIfNeeded(next);
		});
	},
	hydrate(entries: Array<[string, SubSortEntry]>, mode: 'merge' | 'replace'): void {
		internal.update((m) => {
			const next = mode === 'replace' ? new Map<string, SubSortEntry>() : new Map(m);
			for (const item of entries) {
				if (Array.isArray(item) && typeof item[0] === 'string' && item[1] && typeof item[1].sort === 'string') {
					next.set(item[0].toLowerCase(), {
						sort: item[1].sort,
						usedAt: typeof item[1].usedAt === 'number' ? item[1].usedAt : 0
					});
				}
			}
			return next;
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

// Trailing-write persistence: if a mutation lands while a Preferences.set is in
// flight, queue exactly one follow-up write with the latest state once it lands.
// (A plain "skip if writing" guard would silently drop that mutation.)
let writing = false;
let queued = false;
async function writeBack(): Promise<void> {
	if (writing) {
		queued = true;
		return;
	}
	writing = true;
	try {
		await Preferences.set({
			key: STORAGE_KEY,
			value: JSON.stringify([...get(internal).entries()])
		});
	} finally {
		writing = false;
		if (queued) {
			queued = false;
			void writeBack();
		}
	}
}

async function load(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed)) subSort.hydrate(parsed as Array<[string, SubSortEntry]>, 'replace');
		}
	} catch {
		// fall through to empty
	}
	// Skip the synchronous fire subscribe() makes with the just-loaded state.
	let ready = false;
	internal.subscribe(() => {
		if (ready) void writeBack();
	});
	ready = true;
}

export const subSortReady = load();
