// Open a URL outside the app: a Capacitor in-app browser tab on native, a new
// tab on web. Single source of truth so link-opening behavior can't drift
// between the settings page, image viewer, update banner, etc. Returns true if
// it opened, false if the platform browser threw — callers that need to know
// (e.g. keep a banner up on failure) can branch on it.

import { Browser } from '@capacitor/browser';
import { IS_NATIVE } from '$lib/utils/platform';

export interface OpenExternalOptions {
	presentationStyle?: 'fullscreen' | 'popover';
}

export async function openExternal(url: string, opts: OpenExternalOptions = {}): Promise<boolean> {
	if (!url) return false;
	try {
		if (IS_NATIVE) {
			await Browser.open({ url, presentationStyle: opts.presentationStyle });
		} else {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
		return true;
	} catch {
		return false;
	}
}
