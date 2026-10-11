// Whether to play the launch animation, decided before the first paint.
//
// The preference itself lives in prefs.ts, which loads asynchronously; by the
// time it has, the launch is over. So the one bit that matters is mirrored
// into localStorage, which can be read synchronously while the layout is
// being constructed.

import { writable } from 'svelte/store';

const KEY = 'persimmon.intro';

/**
 * True from launch until the animation has left the screen. Anything that
 * would otherwise appear on top of it (the unlock prompt of a locked app)
 * waits for this to go false.
 */
export const introPlaying = writable(false);

export function mirrorIntroPref(enabled: boolean): void {
	try {
		if (enabled) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, '0');
	} catch {
		// Storage unavailable: the animation just stays at its default.
	}
}

/**
 * True on a fresh launch. Not when the app is putting the user back where the
 * system interrupted them (that should look like nothing happened), and not
 * for someone who has asked their phone for less motion.
 */
export function shouldPlayIntro(restoringSession: boolean): boolean {
	if (typeof window === 'undefined' || restoringSession) return false;
	try {
		if (localStorage.getItem(KEY) === '0') return false;
	} catch {
		// fall through to the default
	}
	return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
