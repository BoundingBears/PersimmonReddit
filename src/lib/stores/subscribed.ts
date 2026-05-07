// Locally-tracked "subscribed" subreddits — we can't use Reddit's real
// subscriptions without OAuth, so this is a client-side bookmark list.
//
// v2 stores per-entry icon/color metadata so the UI can render them as proper
// chips. Old v1 storage (plain string[]) is migrated on load.

import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import { tick as haptic } from '$lib/utils/haptics';

export interface SubscribedEntry {
	name: string;
	iconImg?: string;
	primaryColor?: string;
	subscribers?: number;
}

const STORAGE_KEY = 'persimmon.subscribed';

const internal = writable<SubscribedEntry[]>([]);

function lower(s: string) {
	return s.toLowerCase();
}

export const subscribed = {
	subscribe: internal.subscribe,
	add(name: string, info?: Omit<SubscribedEntry, 'name'>): void {
		let isNew = false;
		internal.update((arr) => {
			const idx = arr.findIndex((e) => lower(e.name) === lower(name));
			if (idx >= 0) {
				// already there — merge metadata if provided
				if (!info) return arr;
				const next = [...arr];
				next[idx] = { ...next[idx], ...info };
				return next;
			}
			isNew = true;
			return [...arr, { name, ...info }];
		});
		if (isNew) haptic();
	},
	remove(name: string): void {
		let removed = false;
		internal.update((arr) => {
			const next = arr.filter((e) => lower(e.name) !== lower(name));
			removed = next.length !== arr.length;
			return next;
		});
		if (removed) haptic();
	},
	has(name: string, list: SubscribedEntry[]): boolean {
		const l = lower(name);
		return list.some((e) => lower(e.name) === l);
	},
	clear(): void {
		internal.set([]);
	}
};

async function load(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) {
			const parsed = JSON.parse(value);
			// Migrate v1 (string[]) → v2 (SubscribedEntry[]).
			const list: SubscribedEntry[] = Array.isArray(parsed)
				? parsed.map((e) => (typeof e === 'string' ? { name: e } : e))
				: [];
			internal.set(list);
		}
	} catch {
		// fall through
	}
	internal.subscribe(async (arr) => {
		try {
			await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(arr) });
		} catch {
			// ignore
		}
	});
}

export const subscribedReady = load();
