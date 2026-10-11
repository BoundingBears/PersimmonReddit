// Copy or share an image as the actual picture, not as a link to it.
//
// Sharing used to pass the image URL, so the receiving app got a web address.
// Both actions here download the file to the cache directory first and hand
// over the file itself: the share sheet then shows the picture (and offers the
// system's own Copy and Edit on recent Android), and Copy puts the image on
// the clipboard ready to paste.

import { registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { IS_NATIVE } from './platform';
import { fileNameFromUrl } from './saveImage';
import { expectAbsence } from '$lib/stores/lock';

interface ImageClipboardPlugin {
	copy(options: { path: string }): Promise<void>;
}
const ImageClipboard = registerPlugin<ImageClipboardPlugin>('ImageClipboard');

// One folder in the cache dir, covered by the <cache-path> FileProvider entry.
const SHARE_DIR = 'shared';
const KNOWN_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

function cacheName(url: string): string {
	const name = fileNameFromUrl(url).replace(/[^A-Za-z0-9._-]/g, '_');
	// The receiving app decides what the file is from its extension.
	return KNOWN_EXT.test(name) ? name : `${name}.jpg`;
}

/** Download `url` into the cache directory; resolves to the local file path. */
export async function toCacheFile(url: string): Promise<string> {
	// downloadFile does not create the folder itself, whatever `recursive`
	// suggests, and the system may empty the cache at any time. mkdir rejects
	// when the folder is already there, which is the usual case.
	await Filesystem.mkdir({ path: SHARE_DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
	const res = await Filesystem.downloadFile({
		url,
		path: `${SHARE_DIR}/${cacheName(url)}`,
		directory: Directory.Cache,
		recursive: true,
		headers: { Referer: 'https://www.reddit.com' }
	});
	if (!res.path) throw new Error('download produced no file');
	return res.path;
}

export interface ImageActionResult {
	ok: boolean;
	message: string;
}

export async function copyImage(url: string): Promise<ImageActionResult> {
	if (!IS_NATIVE) {
		try {
			await navigator.clipboard.writeText(url);
			return { ok: true, message: 'Image link copied' };
		} catch {
			return { ok: false, message: "Couldn't copy" };
		}
	}
	try {
		const path = await toCacheFile(url);
		await ImageClipboard.copy({ path });
		return { ok: true, message: 'Image copied' };
	} catch (e) {
		console.error('copyImage failed', url, e);
		return { ok: false, message: "Couldn't copy the image" };
	}
}

export async function shareImage(url: string): Promise<ImageActionResult> {
	try {
		if (IS_NATIVE) {
			let file: string | null = null;
			try {
				file = await toCacheFile(url);
			} catch (e) {
				console.error('shareImage download failed, sharing the link instead', e);
			}
			expectAbsence();
			if (file) {
				await Share.share({ files: [file.startsWith('file://') ? file : `file://${file}`], dialogTitle: 'Share image' });
			} else {
				await Share.share({ url, dialogTitle: 'Share image' });
			}
		} else if (navigator.share) {
			await navigator.share({ url });
		} else {
			await navigator.clipboard?.writeText(url);
			return { ok: true, message: 'Image link copied' };
		}
		return { ok: true, message: '' };
	} catch {
		// The user closing the share sheet rejects too. Nothing to report.
		return { ok: true, message: '' };
	}
}
