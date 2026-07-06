// Self-update check for the sideloaded APK. There is no Play Store auto-update,
// so on launch (throttled to once a day) we ask the GitHub Releases API whether
// a newer tag exists and, if so, surface a dismissible banner that links to the
// release page. No backend, no account; a failed check is silent.
//
// What we discover is persisted (lastKnownUpdateVersion/Url), so a known,
// undismissed update keeps showing across relaunches without another network
// round trip — the throttle governs *when we re-check GitHub*, not whether the
// banner appears.

import { get, writable } from 'svelte/store';
import { prefs } from '$lib/stores/prefs';
import {
	GITHUB_RELEASES_API_URL as RELEASES_API,
	GITHUB_RELEASES_LATEST_URL as RELEASES_PAGE
} from '$lib/utils/appLinks';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day for the silent launch check

export interface UpdateInfo {
	version: string; // normalised, e.g. "1.3.0"
	url: string; // release page to open
}

export const updateAvailable = writable<UpdateInfo | null>(null);

export type UpdateResult = 'available' | 'up-to-date' | 'error';

// Numeric semver compare so "1.2.10" beats "1.2.9" (string compare would not).
function isNewer(remote: string, local: string): boolean {
	const r = remote.split('.').map((n) => parseInt(n, 10) || 0);
	const l = local.split('.').map((n) => parseInt(n, 10) || 0);
	const len = Math.max(r.length, l.length);
	for (let i = 0; i < len; i++) {
		const a = r[i] ?? 0;
		const b = l[i] ?? 0;
		if (a !== b) return a > b;
	}
	return false;
}

const norm = (v: string) => v.replace(/^v/i, '').trim();

// Forget a persisted update (no newer release, or the user has upgraded past
// the one we knew about).
function clearKnownUpdate(): void {
	const p = get(prefs);
	if (!p.lastKnownUpdateVersion && !p.lastKnownUpdateUrl) return;
	prefs.update((pp) => ({ ...pp, lastKnownUpdateVersion: '', lastKnownUpdateUrl: '' }));
	void prefs.flush();
}

// Re-surface a previously-discovered update straight from persisted prefs, no
// fetch required — this is what makes the banner survive a relaunch. Also
// self-heals: if the build has since caught up to (or past) the known version,
// the stale record is dropped.
function rehydrateKnownUpdate(): void {
	const p = get(prefs);
	const known = norm(p.lastKnownUpdateVersion ?? '');
	if (!known || !isNewer(known, norm(__APP_VERSION__))) {
		clearKnownUpdate();
		return;
	}
	if (get(updateAvailable)) return; // don't clobber an already-shown (fresher) banner
	if (p.dismissedUpdateVersion === known) return; // user dismissed this exact version
	updateAvailable.set({ version: known, url: p.lastKnownUpdateUrl || RELEASES_PAGE });
}

export async function checkForUpdates(opts: { force?: boolean } = {}): Promise<UpdateResult> {
	const now = Date.now();

	// Show any persisted update immediately, independent of the network throttle.
	rehydrateKnownUpdate();

	// Throttle the *network* check. `sinceLast >= 0` means a backwards clock
	// change (a stored timestamp now in the future) falls through to a real
	// check instead of suppressing checks until the clock catches up.
	const sinceLast = now - get(prefs).lastUpdateCheck;
	if (!opts.force && sinceLast >= 0 && sinceLast < CHECK_INTERVAL_MS) {
		return get(updateAvailable) ? 'available' : 'up-to-date';
	}

	// Stamp the attempt time *before* the request so a failure (offline, GitHub
	// rate-limit) still backs off for the interval instead of re-firing on every
	// launch — important on shared IPs where GitHub's 60/hr limit is easy to hit.
	prefs.update((p) => ({ ...p, lastUpdateCheck: now }));
	void prefs.flush();

	try {
		const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
		if (!res.ok) return 'error';
		const data = (await res.json()) as { tag_name?: string; html_url?: string };
		const remote = norm(data.tag_name ?? '');

		if (!remote || !isNewer(remote, norm(__APP_VERSION__))) {
			clearKnownUpdate();
			updateAvailable.set(null);
			return 'up-to-date';
		}

		const url = data.html_url || RELEASES_PAGE;
		// Persist what we learned so the banner survives a relaunch (rehydrate).
		prefs.update((p) => ({ ...p, lastKnownUpdateVersion: remote, lastKnownUpdateUrl: url }));
		void prefs.flush();

		// A manual (forced) check always surfaces the banner; the silent launch
		// check respects a prior dismissal of this exact version.
		if (!opts.force && get(prefs).dismissedUpdateVersion === remote) {
			updateAvailable.set(null);
			return 'available';
		}
		updateAvailable.set({ version: remote, url });
		return 'available';
	} catch {
		return 'error';
	}
}

// X on the banner: remember this version so the silent check stops nagging.
// flush() so the dismissal survives a quick app-kill (the 200ms debounced write
// otherwise loses it and the banner re-appears next launch).
export function dismissUpdate(): void {
	const info = get(updateAvailable);
	if (info) {
		prefs.update((p) => ({ ...p, dismissedUpdateVersion: info.version }));
		void prefs.flush();
	}
	updateAvailable.set(null);
}

// Tapping "Update" opens the release; just close the banner for this session
// (no permanent dismissal, so it reminds again next launch until they upgrade).
export function clearUpdateBanner(): void {
	updateAvailable.set(null);
}
