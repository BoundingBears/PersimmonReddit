// Lightweight global toast queue. Mount the <Toast> container once in the
// root layout; anything in the app can call `pushToast(...)` to display a
// short message above the bottom nav.
//
// Dedupe: pass a `key` to suppress repeats while a same-keyed toast is still
// visible. Useful for things like 429 rate-limits that retry repeatedly —
// the user only needs to see "we're slowing down" once per event.

import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	key?: string;
	duration: number;
}

const DEFAULT_DURATION_MS = 3000;

export const toasts = writable<Toast[]>([]);

let nextId = 1;

export function pushToast(message: string, opts?: { key?: string; duration?: number }): void {
	const duration = opts?.duration ?? DEFAULT_DURATION_MS;
	const key = opts?.key;
	let added = false;
	let id = 0;
	toasts.update((list) => {
		if (key && list.some((t) => t.key === key)) return list;
		id = nextId++;
		added = true;
		return [...list, { id, message, key, duration }];
	});
	if (added) {
		setTimeout(() => dismissToast(id), duration);
	}
}

export function dismissToast(id: number): void {
	toasts.update((list) => list.filter((t) => t.id !== id));
}
