// Locally-hidden post IDs. Backed by @capacitor/preferences so it survives
// webview cache clears.
//
// As of v1.0.5 we also capture a metadata snapshot per hidden post (title,
// subreddit, author, thumbnail, permalink, hiddenAt timestamp) so the
// /hidden screen can render the list without re-fetching every post. Old
// pre-v1.0.5 entries (plain string IDs in storage) get migrated to entries
// with no metadata — they still filter out of feeds correctly, and on
// /hidden they show as a minimal row with just the ID.
//
// Storage format is a Map<id, HiddenEntry>; the consumer sees a Map and can
// call `.has(id)`, `.size`, etc. directly — same surface as the previous
// Set<string> so existing call sites don't change.

import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

export interface HiddenEntry {
	id: string;
	title?: string;
	subreddit?: string;
	author?: string;
	thumbnail?: string;
	permalink?: string;
	hiddenAt: number;
}

export type HiddenMeta = Partial<Omit<HiddenEntry, 'id' | 'hiddenAt'>>;

const STORAGE_KEY = 'persimmon.hidden';

const internal = writable<Map<string, HiddenEntry>>(new Map());

export const hidden = {
	subscribe: internal.subscribe,
	hide(id: string, meta?: HiddenMeta): void {
		internal.update((m) => {
			const next = new Map(m);
			next.set(id, { id, hiddenAt: Date.now(), ...meta });
			return next;
		});
	},
	// Update metadata on an existing entry without changing its hiddenAt
	// timestamp. Used when we lazily backfill titles for entries that were
	// hidden in older builds (pre-v1.0.5) which only stored plain IDs.
	enrich(id: string, meta: HiddenMeta): void {
		internal.update((m) => {
			const existing = m.get(id);
			if (!existing) return m;
			const next = new Map(m);
			next.set(id, { ...existing, ...meta });
			return next;
		});
	},
	unhide(id: string): void {
		internal.update((m) => {
			if (!m.has(id)) return m;
			const next = new Map(m);
			next.delete(id);
			return next;
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

let writePending = false;
async function loadHidden(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) {
			const parsed = JSON.parse(value) as unknown;
			const map = new Map<string, HiddenEntry>();
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (typeof item === 'string') {
						// Pre-v1.0.5 format: just the ID, no metadata.
						map.set(item, { id: item, hiddenAt: 0 });
					} else if (item && typeof item === 'object' && typeof item.id === 'string') {
						map.set(item.id, {
							id: item.id,
							hiddenAt: typeof item.hiddenAt === 'number' ? item.hiddenAt : 0,
							title: item.title,
							subreddit: item.subreddit,
							author: item.author,
							thumbnail: item.thumbnail,
							permalink: item.permalink
						});
					}
				}
			}
			internal.set(map);
		}
	} catch {
		// fall through
	}
	internal.subscribe(async (m) => {
		if (writePending) return;
		writePending = true;
		try {
			await Preferences.set({
				key: STORAGE_KEY,
				value: JSON.stringify(Array.from(m.values()))
			});
		} finally {
			writePending = false;
		}
	});
}

export const hiddenReady = loadHidden();
