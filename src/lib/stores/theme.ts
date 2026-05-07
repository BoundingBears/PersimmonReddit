// Applies the theme: sets `data-theme` on <html> and updates the Android
// status bar via @capacitor/status-bar. Subscribes to `prefs` so changes
// propagate automatically.

import { browser } from '$app/environment';
import { StatusBar, Style } from '@capacitor/status-bar';
import { IS_NATIVE } from '$lib/utils/platform';
import { prefs, type ThemeName } from './prefs';

function statusBarBg(theme: ThemeName): string {
	switch (theme) {
		case 'amoled':
			return '#000000';
		case 'light':
			return '#fef7ff';
		case 'dark':
		default:
			return '#141218';
	}
}

function applyTheme(theme: ThemeName, accent: string): void {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', theme);
	document.documentElement.style.setProperty('--md-sys-color-primary', accent);
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', statusBarBg(theme));

	if (IS_NATIVE) {
		const style = theme === 'light' ? Style.Light : Style.Dark;
		StatusBar.setStyle({ style }).catch(() => undefined);
		StatusBar.setBackgroundColor({ color: statusBarBg(theme) }).catch(() => undefined);
	}
}

export function initTheme(): void {
	if (!browser) return;
	if (IS_NATIVE) {
		// Default behavior overlays the WebView under the status bar; we want
		// the system to reserve the strip at the top so our app bar doesn't
		// disappear into the clock/battery icons.
		StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
	}
	prefs.subscribe((v) => {
		applyTheme(v.theme, v.accent);
	});
}
