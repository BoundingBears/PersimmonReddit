// The sharpest copy of a picture that is safe to put on screen, for zooming in
// the image viewer.
//
// The viewer opens on the screen-sized rendition. Zooming needs more pixels,
// and the only other thing Reddit offers is the original, which may be a 48
// megapixel camera file. A picture costs four bytes a pixel once decoded; the
// WebView will not decode one that size, and trying is how a renderer gets
// killed. So: originals within a budget are used as they are, and larger ones
// are reduced natively first (see ImageScalePlugin).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { IS_NATIVE } from './platform';
import { toCacheFile } from './imageActions';

interface ImageScalePlugin {
	fit(options: { path: string; maxPixels: number; deleteSource?: boolean }): Promise<{ path: string; width: number; height: number }>;
}
const ImageScale = registerPlugin<ImageScalePlugin>('ImageScale');

// The most pixels a picture may have and still be handed to the WebView. A
// 12 MP phone photo fits untouched; a 48 MP one is halved each way to 12 MP,
// which on a 1280 px wide screen is still sharp at about 3x zoom.
const MAX_PIXELS = 16_000_000;

// Resolves once `src` is downloaded and decoded, so swapping it into an <img>
// shows it at once. False if it cannot be decoded.
function preload(src: string): Promise<boolean> {
	const img = new Image();
	img.referrerPolicy = 'no-referrer';
	img.src = src;
	return img.decode().then(
		() => true,
		() => false
	);
}

/**
 * A URL to show in place of the screen-sized rendition, already decoded.
 * `pixels` is the original's width times height when known. Resolves to null
 * if nothing sharper could be made, in which case the rendition stays.
 */
export async function sharpCopy(url: string, pixels?: number): Promise<string | null> {
	// Unknown size is tried directly too: if it turns out to be too large the
	// decode fails cleanly and we fall through to the native route.
	if (!pixels || pixels <= MAX_PIXELS) {
		if (await preload(url)) return url;
	}
	if (!IS_NATIVE) return null;
	try {
		const path = await toCacheFile(url);
		const fit = await ImageScale.fit({ path, maxPixels: MAX_PIXELS, deleteSource: true });
		const local = Capacitor.convertFileSrc(fit.path);
		return (await preload(local)) ? local : null;
	} catch (e) {
		console.error('sharpCopy failed', url, e);
		return null;
	}
}
