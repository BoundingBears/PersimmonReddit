// Read-state tracking: post IDs the user has opened, so feeds can grey out
// already-seen titles (old.reddit-style). Backed by @capacitor/preferences so
// it survives webview cache clears.
//
// Storage shape is a Map<id, openedAt(ms)>; consumers see the Map and can call
// `$readPosts.has(id)` directly. The timestamp powers two bits of housekeeping:
//   - Age-out: entries older than 180 days are dropped on load. Old Reddit
//     posts get archived/disappear anyway, so remembering them forever is waste.
//   - LRU cap: at 20k entries we drop the oldest 5k in one batch. At ~10 bytes
//     of JSON per entry that caps storage near 600 KB — well under the webview's
//     localStorage budget — and keeps the Map fast.

import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

const STORAGE_KEY = 'persimmon.read';
const MAX_ENTRIES = 20_000;
const EVICT_BATCH = 5_000;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

const internal = writable<Map<string, number>>(new Map());

// Drop the oldest EVICT_BATCH entries (by timestamp) once the cap is exceeded.
// Runs rarely — only when crossing MAX_ENTRIES — so the O(n log n) sort is fine.
function evictIfNeeded(m: Map<string, number>): Map<string, number> {
	if (m.size <= MAX_ENTRIES) return m;
	const sorted = [...m.entries()].sort((a, b) => a[1] - b[1]);
	return new Map(sorted.slice(EVICT_BATCH));
}

export const readPosts = {
	subscribe: internal.subscribe,
	mark(id: string): void {
		internal.update((m) => {
			const next = new Map(m);
			next.set(id, Date.now());
			return evictIfNeeded(next);
		});
	},
	// Mark many posts read in one store update (used by "mark all read"). Existing
	// entries keep their original timestamp so LRU recency isn't reset.
	markAll(ids: string[]): void {
		if (ids.length === 0) return;
		internal.update((m) => {
			const next = new Map(m);
			const now = Date.now();
			for (const id of ids) {
				if (!next.has(id)) next.set(id, now);
			}
			return evictIfNeeded(next);
		});
	},
	// Non-reactive convenience check (components usually use `$readPosts.has(id)`).
	has(id: string): boolean {
		return get(internal).has(id);
	},
	// Bulk-load [id, openedAt] pairs from a backup import, preserving timestamps.
	hydrate(entries: Array<[string, number]>, mode: 'merge' | 'replace'): void {
		internal.update((m) => {
			const next = mode === 'replace' ? new Map<string, number>() : new Map(m);
			for (const item of entries) {
				if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'number') {
					next.set(item[0], item[1]);
				}
			}
			return evictIfNeeded(next);
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

// Trailing-write persistence: a "skip if a write is in flight" guard would
// silently drop a mutation that lands mid-write (e.g. a one-shot markAll). So
// instead we remember that another write is owed and run exactly one more after
// the current finishes, with the latest state.
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
			const map = new Map<string, number>();
			const cutoff = Date.now() - MAX_AGE_MS;
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (
						Array.isArray(item) &&
						typeof item[0] === 'string' &&
						typeof item[1] === 'number'
					) {
						if (item[1] >= cutoff) map.set(item[0], item[1]);
					}
				}
			}
			internal.set(map);
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

export const readPostsReady = load();
