// Feed groups ("multireddits"): named bundles of subscribed subreddits, each
// with its own merged feed at /g/<name>. Local-only (Reddit's multireddit
// endpoint needs OAuth), modeled on subscribed.ts. Coexists with the existing
// all-subscribed feed — groups are additive.

import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import { tick as haptic } from '$lib/utils/haptics';

export interface GroupEntry {
	name: string;
	subreddits: string[];
	iconEmoji?: string;
	order?: number;
}

const STORAGE_KEY = 'persimmon.groups';

const internal = writable<GroupEntry[]>([]);

function lower(s: string): string {
	return s.trim().toLowerCase();
}

function normSub(s: string): string {
	return s.trim().replace(/^\/?r\//i, '');
}

export const groups = {
	subscribe: internal.subscribe,
	// Non-reactive lookup by case-insensitive name (used by the /g/[name] route).
	get(name: string): GroupEntry | undefined {
		const l = lower(name);
		return get(internal).find((g) => lower(g.name) === l);
	},
	create(name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		let created = false;
		internal.update((arr) => {
			if (arr.some((g) => lower(g.name) === lower(trimmed))) return arr;
			created = true;
			return [...arr, { name: trimmed, subreddits: [] }];
		});
		if (created) haptic();
	},
	remove(name: string): void {
		internal.update((arr) => arr.filter((g) => lower(g.name) !== lower(name)));
	},
	addSub(groupName: string, sub: string): void {
		const s = normSub(sub);
		if (!s) return;
		internal.update((arr) =>
			arr.map((g) => {
				if (lower(g.name) !== lower(groupName)) return g;
				if (g.subreddits.some((x) => lower(x) === lower(s))) return g;
				return { ...g, subreddits: [...g.subreddits, s] };
			})
		);
	},
	removeSub(groupName: string, sub: string): void {
		internal.update((arr) =>
			arr.map((g) =>
				lower(g.name) === lower(groupName)
					? { ...g, subreddits: g.subreddits.filter((x) => lower(x) !== lower(sub)) }
					: g
			)
		);
	},
	// Replace a group's whole sub list at once (used by the checklist editor).
	// Normalises and de-dupes case-insensitively, preserving order.
	setSubreddits(groupName: string, subs: string[]): void {
		const seen = new Set<string>();
		const cleaned: string[] = [];
		for (const raw of subs) {
			const s = normSub(raw);
			if (!s || seen.has(lower(s))) continue;
			seen.add(lower(s));
			cleaned.push(s);
		}
		internal.update((arr) =>
			arr.map((g) => (lower(g.name) === lower(groupName) ? { ...g, subreddits: cleaned } : g))
		);
	},
	// Bulk-load from a backup import. No per-entry haptic; dedupe by name.
	hydrate(entries: GroupEntry[], mode: 'merge' | 'replace'): void {
		internal.update((arr) => {
			const byName = new Map<string, GroupEntry>(
				mode === 'replace' ? [] : arr.map((g) => [lower(g.name), g])
			);
			for (const g of entries) {
				if (g && typeof g.name === 'string' && Array.isArray(g.subreddits)) {
					byName.set(lower(g.name), {
						name: g.name,
						subreddits: g.subreddits.filter((s): s is string => typeof s === 'string'),
						iconEmoji: typeof g.iconEmoji === 'string' ? g.iconEmoji : undefined,
						order: typeof g.order === 'number' ? g.order : undefined
					});
				}
			}
			return [...byName.values()];
		});
	},
	clear(): void {
		internal.set([]);
	}
};

let writing = false;
let queued = false;
async function writeBack(): Promise<void> {
	if (writing) {
		queued = true;
		return;
	}
	writing = true;
	try {
		await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(get(internal)) });
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
			if (Array.isArray(parsed)) groups.hydrate(parsed as GroupEntry[], 'replace');
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

export const groupsReady = load();
