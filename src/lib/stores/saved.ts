// Locally-saved ("bookmarked") posts. Reddit's own save action needs OAuth,
// so — like subscriptions and hidden posts — this lives on the device only.
//
// Mirrors hidden.ts: storage is a Map<id, SavedEntry> with a metadata snapshot
// (title, subreddit, author, thumbnail, permalink, nsfw) captured at save time
// so the /saved screen renders without re-fetching every post. Consumers see a
// Map and can call `.has(id)`, `.size`, etc. directly.

import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

export interface SavedEntry {
	id: string;
	title?: string;
	subreddit?: string;
	author?: string;
	thumbnail?: string;
	permalink?: string;
	nsfw?: boolean;
	savedAt: number;
}

export type SavedMeta = Partial<Omit<SavedEntry, 'id' | 'savedAt'>>;

const STORAGE_KEY = 'persimmon.saved';

const internal = writable<Map<string, SavedEntry>>(new Map());

export const saved = {
	subscribe: internal.subscribe,
	save(id: string, meta?: SavedMeta): void {
		internal.update((m) => {
			const next = new Map(m);
			next.set(id, { id, savedAt: Date.now(), ...meta });
			return next;
		});
	},
	enrich(id: string, meta: SavedMeta): void {
		internal.update((m) => {
			const existing = m.get(id);
			if (!existing) return m;
			const next = new Map(m);
			next.set(id, { ...existing, ...meta });
			return next;
		});
	},
	unsave(id: string): void {
		internal.update((m) => {
			if (!m.has(id)) return m;
			const next = new Map(m);
			next.delete(id);
			return next;
		});
	},
	// Bulk-load entries from a backup import, preserving their savedAt stamps.
	hydrate(entries: SavedEntry[], mode: 'merge' | 'replace'): void {
		internal.update((m) => {
			const next = mode === 'replace' ? new Map<string, SavedEntry>() : new Map(m);
			for (const e of entries) {
				if (e && typeof e.id === 'string') next.set(e.id, e);
			}
			return next;
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

let writePending = false;
async function load(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) {
			const parsed = JSON.parse(value) as unknown;
			const map = new Map<string, SavedEntry>();
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (item && typeof item === 'object' && typeof item.id === 'string') {
						map.set(item.id, {
							id: item.id,
							savedAt: typeof item.savedAt === 'number' ? item.savedAt : 0,
							title: item.title,
							subreddit: item.subreddit,
							author: item.author,
							thumbnail: item.thumbnail,
							permalink: item.permalink,
							nsfw: item.nsfw
						});
					}
				}
			}
			internal.set(map);
		}
	} catch {
		// fall through to empty
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

export const savedReady = load();
