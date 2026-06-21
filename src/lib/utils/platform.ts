// One-shot evaluation of Capacitor's native-platform check. The answer never
// changes during a session, so there's no reason to re-call it from every
// component that needs to branch on web vs native.

import { Capacitor } from '@capacitor/core';

export const IS_NATIVE: boolean = (() => {
	try {
		return Capacitor.isNativePlatform();
	} catch {
		return false;
	}
})();

// iOS-specific branch — App Store policy requires us to hide NSFW content
// rather than gate it behind a user toggle, so any NSFW handling needs to
// know whether we're on iOS. Other platform branches (Android, web) keep
// the existing toggle-based behavior.
export const IS_IOS: boolean = (() => {
	try {
		return Capacitor.getPlatform() === 'ios';
	} catch {
		return false;
	}
})();
