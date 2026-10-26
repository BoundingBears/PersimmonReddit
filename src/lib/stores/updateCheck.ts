// Self-update check for the sideloaded APK. There is no Play Store auto-update,
// so we ask the GitHub Releases API whether a newer tag exists: on launch and
// whenever the app comes back to the front, at most every few hours. A day
// used to pass between checks, so a release could wait a day to be noticed.
//
// What a found update looks like, after Mihon's: a sheet with the release
// notes and Update / Not now / Skip this version (UpdateSheet.svelte), opened
// by itself once per launch for a version not skipped. "Not now" leaves the
// banner in the top bar; Settings keeps an "Update to vX" row whatever was
// chosen, so a skipped update can still be found. No backend, no account; a
// failed check is silent.
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

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // between silent checks; GitHub allows 60 an hour

export interface UpdateInfo {
	version: string; // normalised, e.g. "1.3.0"
	url: string; // release page to open
	apkUrl?: string; // direct .apk asset, for the in-app installer
	notes?: string; // the release's notes (markdown), for the sheet
}

// The banner in the top bar: a newer version, not skipped, not set aside.
export const updateAvailable = writable<UpdateInfo | null>(null);
// The newest version known, whatever the user chose about it (Settings row).
export const knownUpdate = writable<UpdateInfo | null>(null);
// The update sheet.
export const updateSheetOpen = writable(false);
// Versions the sheet has already opened for by itself since launch: once is
// asking, every return to the app would be nagging.
const promptedThisLaunch = new Set<string>();

// The release notes as written for GitHub, less the install instructions,
// which the sheet itself replaces.
function notesFrom(body: string | undefined): string {
	return (body ?? '')
		.split(/\r?\n/)
		.filter((line) => !/^\s*\*\*Install:?\*\*/i.test(line) && !/^#+\s*Persimmon v/i.test(line))
		.join('\n')
		.trim();
}

function offer(info: UpdateInfo, opts: { force?: boolean } = {}): void {
	knownUpdate.set(info);
	const skipped = get(prefs).dismissedUpdateVersion === info.version;
	if (skipped && !opts.force) {
		updateAvailable.set(null);
		return;
	}
	updateAvailable.set(info);
	if (opts.force || !promptedThisLaunch.has(info.version)) {
		promptedThisLaunch.add(info.version);
		updateSheetOpen.set(true);
	}
}

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
	knownUpdate.set(null);
	if (!p.lastKnownUpdateVersion && !p.lastKnownUpdateUrl && !p.lastKnownUpdateApkUrl) return;
	prefs.update((pp) => ({
		...pp,
		lastKnownUpdateVersion: '',
		lastKnownUpdateUrl: '',
		lastKnownUpdateApkUrl: '',
		lastKnownUpdateNotes: ''
	}));
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
	if (get(knownUpdate)) return; // don't clobber an already-known (fresher) one
	offer({
		version: known,
		url: p.lastKnownUpdateUrl || RELEASES_PAGE,
		apkUrl: p.lastKnownUpdateApkUrl || undefined,
		notes: p.lastKnownUpdateNotes || undefined
	});
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
		const data = (await res.json()) as {
			tag_name?: string;
			html_url?: string;
			body?: string;
			assets?: Array<{ name?: string; browser_download_url?: string }>;
		};
		const remote = norm(data.tag_name ?? '');

		if (!remote || !isNewer(remote, norm(__APP_VERSION__))) {
			clearKnownUpdate();
			updateAvailable.set(null);
			return 'up-to-date';
		}

		const url = data.html_url || RELEASES_PAGE;
		// The .apk asset lets us install in-app instead of bouncing to a browser.
		// A release without one (notes-only, or a botched upload) simply falls
		// back to the release page — apkUrl stays undefined.
		const apkUrl =
			data.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'))?.browser_download_url ?? '';
		const notes = notesFrom(data.body);
		// Persist what we learned so it survives a relaunch (rehydrate).
		prefs.update((p) => ({
			...p,
			lastKnownUpdateVersion: remote,
			lastKnownUpdateUrl: url,
			lastKnownUpdateApkUrl: apkUrl,
			lastKnownUpdateNotes: notes
		}));
		void prefs.flush();

		// A manual (forced) check always shows the sheet; the silent check
		// respects a skipped version and asks once per launch.
		offer({ version: remote, url, apkUrl: apkUrl || undefined, notes: notes || undefined }, opts);
		return 'available';
	} catch {
		return 'error';
	}
}

// "Skip this version" in the sheet: no sheet and no banner for this version
// again (the Settings row stays). flush() so it survives a quick app-kill.
export function skipUpdate(): void {
	const info = get(knownUpdate) ?? get(updateAvailable);
	if (info) {
		prefs.update((p) => ({ ...p, dismissedUpdateVersion: info.version }));
		void prefs.flush();
	}
	updateAvailable.set(null);
	updateSheetOpen.set(false);
}

// The banner's X: out of the way until the app is next opened.
export const dismissUpdate = clearUpdateBanner;

/** Show the sheet for the known update (the banner, the Settings row). */
export function openUpdateSheet(): void {
	if (get(knownUpdate) ?? get(updateAvailable)) updateSheetOpen.set(true);
}

// Tapping "Update" opens the release; just close the banner for this session
// (no permanent dismissal, so it reminds again next launch until they upgrade).
export function clearUpdateBanner(): void {
	updateAvailable.set(null);
}
