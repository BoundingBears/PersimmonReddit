// Applies the theme: sets `data-theme` on <html> and updates the Android
// status bar via @capacitor/status-bar. Subscribes to `prefs` so changes
// propagate automatically.

import { browser } from '$app/environment';
import { StatusBar, Style } from '@capacitor/status-bar';
import { IS_NATIVE } from '$lib/utils/platform';
import { prefs, DEFAULT_PREFS, type ThemeName } from './prefs';

const LIGHT_THEMES = new Set<ThemeName>(['light', 'cream']);

function statusBarBg(theme: ThemeName): string {
	// Match each theme's `--md-sys-color-surface` so the system status bar
	// blends with the top app bar instead of showing a hard line.
	switch (theme) {
		case 'amoled':
			return '#000000';
		case 'light':
			return '#fef7ff';
		case 'cream':
			return '#fbf6e8';
		case 'twilight':
			return '#1a1b3a';
		case 'slate':
			return '#282a36';
		case 'sunset':
			return '#2a1a1f';
		case 'dark':
		default:
			return '#141218';
	}
}

function applyTheme(theme: ThemeName, accent: string): void {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', theme);
	// Only override the theme's natural primary when the user has explicitly
	// picked a custom accent. Otherwise each theme shows its signature primary
	// (Twilight's blurple, Cream's coffee-tan, Nord's frost-blue, etc.).
	if (accent && accent !== DEFAULT_PREFS.accent) {
		document.documentElement.style.setProperty('--md-sys-color-primary', accent);
	} else {
		document.documentElement.style.removeProperty('--md-sys-color-primary');
	}
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', statusBarBg(theme));

	if (IS_NATIVE) {
		const style = LIGHT_THEMES.has(theme) ? Style.Light : Style.Dark;
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
