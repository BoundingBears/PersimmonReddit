// Persistent "last-good feed" cache. Unlike the 60s in-memory dedupe cache in
// client.ts, this survives an app restart so a cold start with no network (or a
// Reddit block) can still show the most recent feed instead of an error.
//
// Deliberately conservative because each entry is a full listing JSON (~tens of
// KB), not a tiny id like readPosts:
//   - First pages only (callers pass no `after` cursor) — we never cache deep
//     pagination, so this is "last-good first page", not a whole scrolled feed.
//   - Per-entry size guard: anything over MAX_BYTES is skipped (don't bloat the
//     single Preferences blob with a giant comment tree).
//   - Small LRU cap so the serialized blob stays ~1 MB worst case.
//   - TTL age-out so we never show very old data.
// NOT included in backups (transient, regenerable).

import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

export interface FeedCacheEntry {
	at: number;
	data: unknown;
}

const STORAGE_KEY = 'persimmon.feedcache';
const MAX_ENTRIES = 12;
const MAX_BYTES = 100_000;

const internal = writable<Map<string, FeedCacheEntry>>(new Map());

function evictIfNeeded(m: Map<string, FeedCacheEntry>): Map<string, FeedCacheEntry> {
	if (m.size <= MAX_ENTRIES) return m;
	const sorted = [...m.entries()].sort((a, b) => a[1].at - b[1].at);
	return new Map(sorted.slice(m.size - MAX_ENTRIES));
}

export const feedCache = {
	subscribe: internal.subscribe,
	// Returns the entry regardless of age; the caller decides staleness via TTL.
	get(key: string): FeedCacheEntry | undefined {
		return get(internal).get(key);
	},
	put(key: string, data: unknown): void {
		let bytes = 0;
		try {
			bytes = JSON.stringify(data).length;
		} catch {
			return; // non-serializable — skip
		}
		if (bytes > MAX_BYTES) return;
		internal.update((m) => {
			const next = new Map(m);
			next.delete(key); // re-insert so it's freshest for LRU ordering
			next.set(key, { at: Date.now(), data });
			return evictIfNeeded(next);
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

// Trailing-write persistence (same pattern as readPosts/subSort).
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
			const map = new Map<string, FeedCacheEntry>();
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (Array.isArray(item) && typeof item[0] === 'string' && item[1] && typeof item[1].at === 'number') {
						map.set(item[0], { at: item[1].at, data: item[1].data });
					}
				}
			}
			internal.set(map);
		}
	} catch {
		// fall through to empty
	}
	// Skip the synchronous fire subscribe() makes with the just-loaded state —
	// persisting what we just read is wasted work (and ~1 MB for this cache).
	let ready = false;
	internal.subscribe(() => {
		if (ready) void writeBack();
	});
	ready = true;
}

export const feedCacheReady = load();
