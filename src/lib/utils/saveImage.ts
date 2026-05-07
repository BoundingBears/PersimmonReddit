// Save an image URL to the user's device. Used by both the lightbox image
// viewer's download button and the long-press post menu's "Save image" action.
//
// Native: fetches via CapacitorHttp (handles Reddit's referer / UA quirks)
// and writes to Documents/Persimmon/<filename>.
// Web: opens in a new tab as a fallback so the user can right-click → save.

import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { IS_NATIVE } from './platform';

export interface SaveImageResult {
	ok: boolean;
	message: string;
}

export function fileNameFromUrl(url: string): string {
	try {
		const u = new URL(url);
		const last = u.pathname.split('/').filter(Boolean).pop() ?? 'image';
		// Strip query suffixes glued onto extensions (?width=…&fmt=…)
		return last.split('?')[0].split('#')[0] || `persimmon-${Date.now()}`;
	} catch {
		return `persimmon-${Date.now()}`;
	}
}

export async function saveImage(url: string): Promise<SaveImageResult> {
	if (!IS_NATIVE) {
		// Web fallback: open in a new tab so the user can right-click → save.
		try {
			window.open(url, '_blank', 'noopener');
			return { ok: true, message: 'Opened in browser' };
		} catch {
			return { ok: false, message: 'Failed to open' };
		}
	}
	try {
		const res = await CapacitorHttp.get({
			url,
			headers: { Referer: 'https://www.reddit.com' },
			responseType: 'blob'
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`HTTP ${res.status}`);
		}
		const filename = fileNameFromUrl(url);
		await Filesystem.writeFile({
			path: `Persimmon/${filename}`,
			data: res.data as string, // base64 from CapacitorHttp blob
			directory: Directory.Documents,
			recursive: true
		});
		return { ok: true, message: `Saved to Documents/Persimmon/${filename}` };
	} catch (e) {
		console.error('saveImage failed', url, e);
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, message: `Save failed: ${msg}` };
	}
}
