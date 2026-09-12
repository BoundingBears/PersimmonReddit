// Blocked users. Posts by a blocked author are dropped from every feed and
// search result, and their comments collapse to a one-line stub in every
// thread (replies to them are kept, so a thread never loses its shape).
//
// Deliberately NOT a fourth kind of `filters`: those apply only to the merged
// subscribed/custom feeds — "don't silently drop posts while browsing a
// specific sub" — whereas blocking someone means everywhere, front page and
// inside a subreddit included. Different contract, different store.
//
// Keys are lowercased usernames without the u/ prefix. Consumers should go
// through isBlocked() rather than .has() so the normalisation lives here.
// Backed by @capacitor/preferences and included in backups.

import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

export interface BlockedUser {
	name: string; // as the user saw/typed it, for display
	blockedAt: number;
}

const STORAGE_KEY = 'persimmon.blockedUsers';

export function normalizeUser(name: string): string {
	return name.trim().replace(/^\/?u\//i, '').toLowerCase();
}

const internal = writable<Map<string, BlockedUser>>(new Map());

export const blockedUsers = {
	subscribe: internal.subscribe,
	block(name: string): void {
		const key = normalizeUser(name);
		if (!key) return;
		internal.update((m) => {
			if (m.has(key)) return m;
			const next = new Map(m);
			next.set(key, { name: name.trim().replace(/^\/?u\//i, ''), blockedAt: Date.now() });
			return next;
		});
	},
	unblock(name: string): void {
		const key = normalizeUser(name);
		internal.update((m) => {
			if (!m.has(key)) return m;
			const next = new Map(m);
			next.delete(key);
			return next;
		});
	},
	// Bulk-load from a backup import, preserving blockedAt stamps.
	hydrate(entries: BlockedUser[], mode: 'merge' | 'replace'): void {
		internal.update((m) => {
			const next = mode === 'replace' ? new Map<string, BlockedUser>() : new Map(m);
			for (const e of entries) {
				if (!e || typeof e.name !== 'string') continue;
				const key = normalizeUser(e.name);
				if (!key) continue;
				next.set(key, { name: e.name, blockedAt: typeof e.blockedAt === 'number' ? e.blockedAt : 0 });
			}
			return next;
		});
	},
	clear(): void {
		internal.set(new Map());
	}
};

export function isBlocked(m: Map<string, BlockedUser>, author: string | null | undefined): boolean {
	if (!author || m.size === 0) return false;
	return m.has(normalizeUser(author));
}

// Trailing-write persistence (same pattern as feedCache): a write that lands
// while one is in flight is queued, never dropped.
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
			value: JSON.stringify([...get(internal).values()])
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
			const map = new Map<string, BlockedUser>();
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (item && typeof item === 'object' && typeof item.name === 'string') {
						const key = normalizeUser(item.name);
						if (key) {
							map.set(key, {
								name: item.name,
								blockedAt: typeof item.blockedAt === 'number' ? item.blockedAt : 0
							});
						}
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

export const blockedUsersReady = load();
