// Single entry point for haptic feedback. Honors the user's `haptics` pref,
// no-ops on web (where the Capacitor plugin throws), and swallows errors so
// callers can fire-and-forget.
//
// Usage: `tick()` for the default light impact. Pass an explicit ImpactStyle
// for heavier or success/warning patterns when relevant.

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IS_NATIVE } from './platform';
import { prefs } from '$lib/stores/prefs';

export { ImpactStyle };

let enabled = true;
prefs.subscribe((p) => {
	enabled = p.haptics;
});

export function tick(style: ImpactStyle = ImpactStyle.Light): void {
	if (!enabled) return;
	if (!IS_NATIVE) return;
	Haptics.impact({ style }).catch(() => undefined);
}
