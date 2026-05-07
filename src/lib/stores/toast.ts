// Lightweight global toast queue. Mount the <Toast> container once in the
// root layout; anything in the app can call `pushToast(...)` to display a
// short message above the bottom nav.
//
// Dedupe: pass a `key` to suppress repeats while a same-keyed toast is still
// visible. Useful for things like 429 rate-limits that retry repeatedly —
// the user only needs to see "we're slowing down" once per event.
//
// Optional `action`: a single button shown alongside the message (e.g.
// "Hidden — UNDO"). Tapping it runs the callback and dismisses the toast.

import { writable } from 'svelte/store';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: number;
	message: string;
	key?: string;
	duration: number;
	action?: ToastAction;
}

const DEFAULT_DURATION_MS = 3000;

export const toasts = writable<Toast[]>([]);

let nextId = 1;
// Per-toast dismiss timers, so we can cancel + re-arm on `replace` without
// the old timer prematurely killing the morphed toast.
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export interface PushToastOptions {
	key?: string;
	duration?: number;
	action?: ToastAction;
	// When set with `key`, an existing toast with the same key is updated in
	// place instead of being deduplicated. Keeps the same `id` so Svelte's
	// keyed each-block reuses the existing DOM node — the toast morphs
	// smoothly instead of fading out and a new one fading in.
	replace?: boolean;
}

export function pushToast(message: string, opts?: PushToastOptions): void {
	const duration = opts?.duration ?? DEFAULT_DURATION_MS;
	const key = opts?.key;
	const action = opts?.action;
	const replace = opts?.replace ?? false;
	let id = 0;
	let armTimer = false;
	toasts.update((list) => {
		const existingIdx = key ? list.findIndex((t) => t.key === key) : -1;
		if (existingIdx >= 0) {
			if (!replace) return list; // dedup
			// Replace in place: keep the same id so the Svelte each-block
			// doesn't unmount + remount the toast. Cancel the existing
			// dismiss timer; we'll arm a fresh one below.
			const existing = list[existingIdx];
			id = existing.id;
			const oldTimer = timers.get(id);
			if (oldTimer) clearTimeout(oldTimer);
			const updated = [...list];
			updated[existingIdx] = { ...existing, message, duration, action };
			armTimer = true;
			return updated;
		}
		id = nextId++;
		armTimer = true;
		return [...list, { id, message, key, duration, action }];
	});
	if (armTimer) {
		const t = setTimeout(() => dismissToast(id), duration);
		timers.set(id, t);
	}
}

export function dismissToast(id: number): void {
	const t = timers.get(id);
	if (t) {
		clearTimeout(t);
		timers.delete(id);
	}
	toasts.update((list) => list.filter((toast) => toast.id !== id));
}
