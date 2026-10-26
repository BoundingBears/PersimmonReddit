import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/stores/prefs', async () => {
	const { writable } = await import('svelte/store');
	const base = { lastUpdateCheck: 0, dismissedUpdateVersion: '', lastKnownUpdateVersion: '', lastKnownUpdateUrl: '', lastKnownUpdateApkUrl: '', lastKnownUpdateNotes: '' };
	const store = writable({ ...base });
	return { prefs: Object.assign(store, { flush: async () => {}, reset: () => store.set({ ...base }) }) };
});

const release = (tag: string, body = '') => ({
	ok: true,
	json: async () => ({
		tag_name: tag,
		html_url: `https://github.com/x/y/releases/tag/${tag}`,
		body,
		assets: [{ name: `persimmon-${tag.slice(1)}.apk`, browser_download_url: `https://example/${tag}.apk` }]
	})
});

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal('__APP_VERSION__', '1.5.1');
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
	const prefsMod = await import('$lib/stores/prefs');
	(prefsMod.prefs as unknown as { reset: () => void }).reset();
	return { ...(await import('./updateCheck')), prefs: prefsMod.prefs };
}

describe('finding an update', () => {
	it('opens the sheet once, with the notes and without the install instructions', async () => {
		const m = await load();
		vi.stubGlobal('fetch', vi.fn(async () => release('v1.5.2', '## Persimmon v1.5.2\n\n- 💬 More comments\n\n**Install:** tap Update')));
		expect(await m.checkForUpdates()).toBe('available');
		expect(get(m.updateSheetOpen)).toBe(true);
		const info = get(m.knownUpdate)!;
		expect(info.version).toBe('1.5.2');
		expect(info.apkUrl).toMatch(/\.apk$/);
		expect(info.notes).toContain('More comments');
		expect(info.notes).not.toMatch(/Install|Persimmon v1\.5\.2/);
		// Not now, then a later check in the same launch: the banner, not the sheet again.
		m.updateSheetOpen.set(false);
		await m.checkForUpdates({ force: false });
		expect(get(m.updateSheetOpen)).toBe(false);
		expect(get(m.updateAvailable)?.version).toBe('1.5.2');
	});

	it('a skipped version stays out of the way but stays findable', async () => {
		const m = await load();
		vi.stubGlobal('fetch', vi.fn(async () => release('v1.5.2')));
		await m.checkForUpdates();
		m.skipUpdate();
		expect(get(m.updateSheetOpen)).toBe(false);
		expect(get(m.updateAvailable)).toBeNull();
		expect(get(m.knownUpdate)?.version).toBe('1.5.2');
		m.prefs.update((p) => ({ ...p, lastUpdateCheck: 0 }));
		await m.checkForUpdates();
		expect(get(m.updateAvailable)).toBeNull();
		expect(get(m.updateSheetOpen)).toBe(false);
		// Asking by hand always shows it.
		await m.checkForUpdates({ force: true });
		expect(get(m.updateSheetOpen)).toBe(true);
	});

	it('nothing newer: nothing shown', async () => {
		const m = await load();
		vi.stubGlobal('fetch', vi.fn(async () => release('v1.5.1')));
		expect(await m.checkForUpdates()).toBe('up-to-date');
		expect(get(m.knownUpdate)).toBeNull();
		expect(get(m.updateSheetOpen)).toBe(false);
	});

	it('checks again after a few hours, not a day', async () => {
		const m = await load();
		const fetcher = vi.fn(async () => release('v1.5.1'));
		vi.stubGlobal('fetch', fetcher);
		await m.checkForUpdates();
		await m.checkForUpdates();
		expect(fetcher).toHaveBeenCalledTimes(1);
		m.prefs.update((p) => ({ ...p, lastUpdateCheck: Date.now() - 7 * 3600_000 }));
		await m.checkForUpdates();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});
