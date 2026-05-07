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
