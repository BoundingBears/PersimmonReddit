// The lock on the private folder, or on the whole app: which one is the
// user's choice in Settings (prefs.lockScope).
//
//   'off'      nothing is locked; the private folder is just a separate list
//   'private'  opening the private folder asks for a fingerprint / screen lock
//   'app'      opening the app does, and then the folder opens freely
//
// Unlocking is Android's own prompt (AppLockPlugin.java). A phone with no
// screen lock cannot be asked for one, so there the scope behaves as 'off'
// rather than locking the user out of their own app.

import { get, writable } from 'svelte/store';
import { registerPlugin } from '@capacitor/core';
import { browser } from '$app/environment';
import { IS_NATIVE } from '$lib/utils/platform';
import { prefs, type LockScope } from './prefs';

interface AppLockPlugin {
	isAvailable(): Promise<{ available: boolean }>;
	authenticate(options: { title: string; subtitle?: string }): Promise<void>;
	setSecure(options: { secure: boolean }): Promise<void>;
	setScrollIndicator(options: { visible: boolean }): Promise<void>;
}
const AppLock = registerPlugin<AppLockPlugin>('AppLock');

// prefs load asynchronously; a locked app has to know it is locked before its
// first frame. Same trick as the launch animation: one value mirrored where
// it can be read synchronously.
const MIRROR_KEY = 'persimmon.lock';
function mirroredScope(): LockScope {
	if (!browser) return 'off';
	try {
		const v = localStorage.getItem(MIRROR_KEY);
		return v === 'app' || v === 'private' || v === 'off' ? v : 'private';
	} catch {
		return 'private';
	}
}

// How soon after leaving the app it locks again is the user's choice
// (prefs.lockDelaySec, "Lock again" in Settings; right away by default).
// On top of that, a trip the app itself sent the user on (the share sheet, a
// link opened in the browser, the file picker, Android's own unlock prompt)
// always gets at least TRIP_GRACE_MS, so that with "right away" sharing a
// post does not cost a fingerprint every time.
const TRIP_GRACE_MS = 30_000;
// How long after the app announces a trip the page may take to actually go
// to the background and still count as that trip.
const EXPECT_WINDOW_MS = 4_000;
let expectedUntil = 0;

/** Call just before the app opens something outside itself. */
export function expectAbsence(): void {
	expectedUntil = Date.now() + EXPECT_WINDOW_MS;
}

/** The whole app is behind the lock screen right now. */
export const appLocked = writable(IS_NATIVE && mirroredScope() === 'app');
/** The private folder has been opened this visit. */
export const privateUnlocked = writable(false);
/** The private folder's list is on screen (set by the Saved page). */
export const privateViewOpen = writable(false);
/** The Saved page is on its Private tab, locked or not (set by the Saved page). */
export const privateTabOpen = writable(false);
/** Whether this phone can be asked to unlock at all. Null until checked. */
export const lockAvailable = writable<boolean | null>(null);

/** The scope actually in force: the chosen one, or 'off' where it cannot work. */
export function effectiveScope(): LockScope {
	if (!IS_NATIVE || get(lockAvailable) === false) return 'off';
	return get(prefs).lockScope;
}

// One prompt at a time. A second request while one is showing (the lock
// screen re-asking as the app comes back, a tap landing twice) joins the one
// already on screen instead of stacking another on top of it.
let asking: Promise<boolean> | null = null;
function authenticate(title: string, subtitle?: string): Promise<boolean> {
	asking ??= AppLock.authenticate({ title, subtitle })
		.then(
			() => true,
			() => false
		)
		.finally(() => (asking = null));
	return asking;
}

/** Ask for the fingerprint at the lock screen. Does not open the app itself. */
export function confirmApp(): Promise<boolean> {
	return authenticate('Unlock Persimmon');
}

/** Take the lock screen away. Call once confirmApp() has said yes. */
export function openApp(): void {
	appLocked.set(false);
}

/** Ask for the fingerprint for the private folder. Does not open it itself. */
export async function confirmPrivate(): Promise<boolean> {
	return effectiveScope() !== 'private' || (await authenticate('Open private folder'));
}

export async function unlockPrivate(): Promise<boolean> {
	const ok = await confirmPrivate();
	if (ok) privateUnlocked.set(true);
	return ok;
}

/**
 * Change what is locked. Asks for the fingerprint first, in both directions:
 * turning a lock off must not be something anyone holding the phone can do,
 * and turning one on proves the prompt works before the app depends on it.
 */
export async function changeLockScope(next: LockScope): Promise<boolean> {
	if (next === get(prefs).lockScope) return true;
	if (get(lockAvailable) && !(await authenticate('Change the lock', 'Confirm it is you'))) return false;
	prefs.update((p) => ({ ...p, lockScope: next }));
	// Whoever just confirmed is in: nothing locks under their feet.
	privateUnlocked.set(true);
	return true;
}

/**
 * Change how long after leaving the app it locks again. Asks first, like
 * changing the scope: a longer delay is a weaker lock.
 */
export async function changeLockDelay(seconds: number): Promise<boolean> {
	if (seconds === get(prefs).lockDelaySec) return true;
	if (get(lockAvailable) && !(await authenticate('Change the lock', 'Confirm it is you'))) return false;
	prefs.update((p) => ({ ...p, lockDelaySec: seconds }));
	return true;
}

/**
 * Keep private content out of screenshots and the recents thumbnail.
 *
 * Turning it on is immediate. Turning it off waits until the app is in front:
 * the private list is hidden the moment the app is left (below), and dropping
 * the protection at that same moment would race the system taking its
 * recents snapshot of a frame that may still show the list.
 */
let wantSecure = false;
export function setSecure(secure: boolean): void {
	wantSecure = secure;
	if (!IS_NATIVE) return;
	if (secure || document.visibilityState === 'visible') AppLock.setSecure({ secure }).catch(() => undefined);
}

/**
 * Show or hide Android's scroll bar for the page. Hidden while something
 * covers the whole app, because the system draws it over the cover.
 */
export function setScrollIndicator(visible: boolean): void {
	if (IS_NATIVE) AppLock.setScrollIndicator({ visible }).catch(() => undefined);
}

/** Wire the lock up. Call once from the layout; returns a cleanup. */
export function installLock(): () => void {
	if (!browser) return () => {};
	if (!IS_NATIVE) {
		lockAvailable.set(false);
		return () => {};
	}
	AppLock.isAvailable()
		.then(({ available }) => {
			lockAvailable.set(available);
			// No screen lock on the phone any more: there is nothing to unlock
			// with, so do not strand the user behind a prompt that cannot appear.
			if (!available) appLocked.set(false);
		})
		.catch(() => {
			lockAvailable.set(false);
			appLocked.set(false);
		});

	let unsubscribe: (() => void) | null = null;
	prefs.ready.then(() => {
		unsubscribe = prefs.subscribe((p) => {
			try {
				localStorage.setItem(MIRROR_KEY, p.lockScope);
			} catch {
				// ignore
			}
		});
		// The mirror said "locked" but the setting has since changed.
		if (get(prefs).lockScope !== 'app') appLocked.set(false);
	});

	let hiddenAt = 0;
	let onATrip = false;
	// What was open when the app was left, to be given back if the user
	// returns soon enough.
	let appWasOpen = false;
	let privateWasOpen = false;
	const onVisibility = () => {
		const now = Date.now();
		if (document.visibilityState === 'hidden') {
			hiddenAt = now;
			onATrip = now < expectedUntil || asking !== null;
			expectedUntil = 0;
			// Everything is covered on the way out, whatever the delay: the
			// first frame on coming back is then never a glimpse of what the
			// lock protects. Whether the cover stays is decided on return.
			appWasOpen = effectiveScope() === 'app' && !get(appLocked);
			if (appWasOpen) appLocked.set(true);
			privateWasOpen = get(privateUnlocked);
			if (privateWasOpen) privateUnlocked.set(false);
			return;
		}
		if (!hiddenAt) return;
		const allowed = Math.max(get(prefs).lockDelaySec * 1000, onATrip ? TRIP_GRACE_MS : 0);
		if (now - hiddenAt < allowed) {
			// Back in time: uncover again, unasked.
			if (appWasOpen) appLocked.set(false);
			if (privateWasOpen) privateUnlocked.set(true);
		}
		hiddenAt = 0;
		onATrip = appWasOpen = privateWasOpen = false;
		// A protection that was due to come off while away comes off now.
		if (!wantSecure) AppLock.setSecure({ secure: false }).catch(() => undefined);
	};
	document.addEventListener('visibilitychange', onVisibility);
	return () => {
		unsubscribe?.();
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
