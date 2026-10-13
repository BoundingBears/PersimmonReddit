// Lightweight global toast queue. Mount the <Toast> container once in the
// root layout; anything in the app can call `pushToast(...)` to display a
// short message above the bottom nav.
//
// How long one stays is decided here, by one rule, and not by whoever shows
// it: long enough to read, longer when it carries a button. Call sites used
// to pick their own number (2.5 s, 3 s, 4 s, 5 s, 6 s), which is part of why
// no two felt alike. A duration is passed only by a message that is waiting
// on something and will be replaced when it finishes ("Saving image…").
//
// Dedupe: pass a `key` to suppress repeats while a same-keyed toast is still
// visible. Useful for things like 429 rate-limits that retry repeatedly —
// the user only needs to see "we're slowing down" once per event.
//
// Optional `action`: a single button shown alongside the message (e.g.
// "Hidden — UNDO"). Tapping it runs the callback and dismisses the toast.

import { get, writable } from 'svelte/store';

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

const READ_MS = 3000;
// Time to decide whether to press the button. Same as undoable.ts.
const WITH_ACTION_MS = 6000;
// Hard cap on simultaneous toasts. A button tapped twenty times in a row
// used to produce twenty stacked toasts that filled the screen; beyond this
// many, the oldest is dropped to make room. Two, now that each one is a
// full-width bar: three of those covered a fifth of the screen.
const MAX_TOASTS = 2;
// After the user lets go of a toast they were holding, it stays at least
// this long, so it does not vanish from under the finger.
const AFTER_HOLD_MS = 1500;

/** Reading time for a message: three seconds, and more for a long one. */
export function defaultDuration(message: string, hasAction: boolean): number {
	const reading = Math.min(READ_MS + Math.max(0, message.length - 30) * 45, 5500);
	return hasAction ? Math.max(WITH_ACTION_MS, reading) : reading;
}

export const toasts = writable<Toast[]>([]);

let nextId = 1;
// Per-toast dismiss timers, so we can cancel + re-arm on `replace` without
// the old timer prematurely killing the morphed toast. `endsAt` is kept so a
// toast held under a finger can pick up where it left off.
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const endsAt = new Map<number, number>();
const held = new Map<number, number>();

function arm(id: number, ms: number): void {
	const old = timers.get(id);
	if (old) clearTimeout(old);
	endsAt.set(id, Date.now() + ms);
	timers.set(
		id,
		setTimeout(() => dismissToast(id), ms)
	);
}
function forget(id: number): void {
	const t = timers.get(id);
	if (t) clearTimeout(t);
	timers.delete(id);
	endsAt.delete(id);
	held.delete(id);
}

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
	const key = opts?.key;
	const action = opts?.action;
	const duration = opts?.duration ?? defaultDuration(message, !!action);
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
			const updated = [...list];
			updated[existingIdx] = { ...existing, message, duration, action };
			armTimer = true;
			return updated;
		}
		id = nextId++;
		armTimer = true;
		const next = [...list, { id, message, key, duration, action }];
		while (next.length > MAX_TOASTS) forget(next.shift()!.id);
		return next;
	});
	if (armTimer) {
		// Replaced while a finger is on it: the new text waits for the release.
		if (held.has(id)) held.set(id, duration);
		else arm(id, duration);
	}
}

export function dismissToast(id: number): void {
	forget(id);
	toasts.update((list) => list.filter((toast) => toast.id !== id));
}

/** A finger is on the toast: stop the clock. */
export function holdToast(id: number): void {
	if (held.has(id) || !timers.has(id)) return;
	held.set(id, Math.max(0, (endsAt.get(id) ?? 0) - Date.now()));
	clearTimeout(timers.get(id));
	timers.delete(id);
}

/** The finger left without dismissing it: run out what was left. */
export function releaseToast(id: number): void {
	const left = held.get(id);
	if (left === undefined) return;
	held.delete(id);
	arm(id, Math.max(left, AFTER_HOLD_MS));
}

/** Dismiss whichever toast carries this key, if one is showing. */
export function dismissToastByKey(key: string): void {
	const hit = get(toasts).find((t) => t.key === key);
	if (hit) dismissToast(hit.id);
}
