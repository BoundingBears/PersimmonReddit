// Full on-device backup: export every local store to one JSON file and restore
// it on a new device or after a reinstall. This is the only "your data leaves
// the app" surface, and it's entirely user-driven — no server, no account.
//
// The file is versioned so future schema changes can migrate on import. v1 is
// the initial format. Each store's own hydrate() method sanitizes its slice, so
// parseBackup() only has to coerce missing slices to safe empties.

import { get } from 'svelte/store';
import { prefs, DEFAULT_PREFS, type Prefs } from '$lib/stores/prefs';
import { subscribed, type SubscribedEntry } from '$lib/stores/subscribed';
import { saved, type SavedEntry } from '$lib/stores/saved';
import { hidden, type HiddenEntry } from '$lib/stores/hidden';
import { readPosts } from '$lib/stores/readPosts';
import { filters, type FilterRules } from '$lib/stores/filters';
import { subSort, type SubSortEntry } from '$lib/stores/subSort';
import { groups, type GroupEntry } from '$lib/stores/groups';

export interface Backup {
	app: 'persimmon';
	version: 1;
	exportedAt: number;
	appVersion: string;
	data: {
		prefs: Prefs;
		subscribed: SubscribedEntry[];
		saved: SavedEntry[];
		hidden: HiddenEntry[];
		readPosts: Array<[string, number]>;
		filters: FilterRules;
		subSort: Array<[string, SubSortEntry]>;
		groups: GroupEntry[];
	};
}

// Branded extension for backup files. The payload is plain JSON — the custom
// extension just makes the file recognizable and keeps users from editing it by
// hand (it is NOT a zip; the data is small enough that compression buys nothing).
export const BACKUP_EXTENSION = '.persimmon';
// Fixed name for the silent auto-backup, so it overwrites in place rather than
// piling up a new file per save.
export const AUTO_BACKUP_FILENAME = `persimmon-auto-backup${BACKUP_EXTENSION}`;

export function exportBackup(): Backup {
	return {
		app: 'persimmon',
		version: 1,
		exportedAt: Date.now(),
		appVersion: __APP_VERSION__,
		data: {
			prefs: get(prefs),
			subscribed: get(subscribed),
			saved: [...get(saved).values()],
			hidden: [...get(hidden).values()],
			readPosts: [...get(readPosts).entries()],
			filters: get(filters),
			subSort: [...get(subSort).entries()],
			groups: get(groups)
		}
	};
}

// Current backup serialized to the string we write to disk.
export function serializeBackup(): string {
	return JSON.stringify(exportBackup(), null, 2);
}

const EMPTY_FILTERS: FilterRules = { keywords: [], subreddits: [], domains: [] };

// Coerce an unknown parsed JSON value into a Backup, or null if it isn't a
// recognizable Persimmon backup. Lenient about missing slices (older/partial
// exports), strict about the version marker.
export function parseBackup(input: unknown): Backup | null {
	if (!input || typeof input !== 'object') return null;
	const b = input as Record<string, unknown>;
	if (b.version !== 1 || !b.data || typeof b.data !== 'object') return null;
	const d = b.data as Record<string, unknown>;
	return {
		app: 'persimmon',
		version: 1,
		exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : Date.now(),
		appVersion: typeof b.appVersion === 'string' ? b.appVersion : '?',
		data: {
			prefs: (d.prefs && typeof d.prefs === 'object' ? d.prefs : {}) as Prefs,
			subscribed: Array.isArray(d.subscribed) ? (d.subscribed as SubscribedEntry[]) : [],
			saved: Array.isArray(d.saved) ? (d.saved as SavedEntry[]) : [],
			hidden: Array.isArray(d.hidden) ? (d.hidden as HiddenEntry[]) : [],
			readPosts: Array.isArray(d.readPosts) ? (d.readPosts as Array<[string, number]>) : [],
			filters: (d.filters && typeof d.filters === 'object' ? d.filters : EMPTY_FILTERS) as FilterRules,
			subSort: Array.isArray(d.subSort) ? (d.subSort as Array<[string, SubSortEntry]>) : [],
			groups: Array.isArray(d.groups) ? (d.groups as GroupEntry[]) : []
		}
	};
}

export interface BackupSummary {
	subscribed: number;
	saved: number;
	hidden: number;
	readPosts: number;
	filters: number;
	exportedAt: number;
	appVersion: string;
}

export function summarize(b: Backup): BackupSummary {
	const f = b.data.filters;
	return {
		subscribed: b.data.subscribed.length,
		saved: b.data.saved.length,
		hidden: b.data.hidden.length,
		readPosts: b.data.readPosts.length,
		filters: (f.keywords?.length ?? 0) + (f.subreddits?.length ?? 0) + (f.domains?.length ?? 0),
		exportedAt: b.exportedAt,
		appVersion: b.appVersion
	};
}

export function importBackup(b: Backup, mode: 'merge' | 'replace'): void {
	// Lists union (merge) or overwrite (replace) via each store's hydrate().
	subscribed.hydrate(b.data.subscribed, mode);
	saved.hydrate(b.data.saved, mode);
	hidden.hydrate(b.data.hidden, mode);
	readPosts.hydrate(b.data.readPosts, mode);
	filters.hydrate(b.data.filters, mode);
	subSort.hydrate(b.data.subSort, mode);
	groups.hydrate(b.data.groups, mode);
	// Preferences are a single object, so merging scalars is meaningless — only
	// a full restore touches them, and we keep any keys this build added that
	// the backup predates.
	if (mode === 'replace') {
		prefs.set({ ...DEFAULT_PREFS, ...b.data.prefs });
	}
}
