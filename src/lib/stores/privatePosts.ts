// The private folder: saved posts kept apart from the Saved list and, if the
// user has a lock on (lock.ts), behind it.
//
// Deliberately NOT a flag on the saved store. The saved list lives in
// Capacitor Preferences, goes into the backup file the app writes to
// Documents, and into Android's cloud backup. Private posts are kept out of
// all three by living somewhere else entirely: one JSON file under
// files/private/, a directory the backup rules exclude
// (res/xml/backup_rules.xml, data_extraction_rules.xml). Their offline copies
// sit beside it in files/private/offline/ (offline.ts).
//
// The price, stated to the user in the folder itself: private posts are not
// in any backup, so uninstalling the app loses them.

import { get, writable } from 'svelte/store';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { browser } from '$app/environment';
import { IS_NATIVE } from '$lib/utils/platform';
import type { SavedEntry, SavedMeta } from './saved';

export const PRIVATE_DIR = 'private';
const INDEX = `${PRIVATE_DIR}/index.json`;
// A browser has no private files directory; this is only for development.
const WEB_KEY = 'persimmon.private';

const internal = writable<Map<string, SavedEntry>>(new Map());

async function read(): Promise<SavedEntry[]> {
	try {
		if (IS_NATIVE) {
			const res = await Filesystem.readFile({ path: INDEX, directory: Directory.Data, encoding: Encoding.UTF8 });
			return JSON.parse(res.data as string);
		}
		return JSON.parse(localStorage.getItem(WEB_KEY) ?? '[]');
	} catch {
		return [];
	}
}

// One write at a time, always of the latest state.
let writing: Promise<void> = Promise.resolve();
function persist(entries: SavedEntry[]): void {
	const data = JSON.stringify(entries);
	writing = writing
		.then(async () => {
			if (!IS_NATIVE) {
				localStorage.setItem(WEB_KEY, data);
				return;
			}
			await Filesystem.writeFile({ path: INDEX, directory: Directory.Data, encoding: Encoding.UTF8, data, recursive: true });
		})
		.catch((e) => console.error('private folder: could not save', e));
}

function change(fn: (m: Map<string, SavedEntry>) => Map<string, SavedEntry> | null): void {
	internal.update((m) => {
		const next = fn(m);
		if (!next) return m;
		persist([...next.values()]);
		return next;
	});
}

export const privatePosts = {
	subscribe: internal.subscribe,
	add(id: string, meta?: SavedMeta, savedAt = Date.now()): void {
		change((m) => new Map(m).set(id, { id, savedAt, ...meta }));
	},
	enrich(id: string, meta: SavedMeta): void {
		change((m) => {
			const existing = m.get(id);
			return existing ? new Map(m).set(id, { ...existing, ...meta }) : null;
		});
	},
	clear(): void {
		change((m) => (m.size > 0 ? new Map() : null));
	},
	remove(id: string): void {
		change((m) => {
			if (!m.has(id)) return null;
			const next = new Map(m);
			next.delete(id);
			return next;
		});
	}
};

export function isPrivate(id: string): boolean {
	return get(internal).has(id);
}

async function load(): Promise<void> {
	if (!browser) return;
	const entries = await read();
	const map = new Map<string, SavedEntry>();
	for (const e of Array.isArray(entries) ? entries : []) {
		if (e && typeof e.id === 'string') map.set(e.id, e);
	}
	internal.set(map);
}

export const privateReady = load();
