// Applies the theme: sets `data-theme` on <html> and updates the Android
// status bar via @capacitor/status-bar. Subscribes to `prefs` so changes
// propagate automatically.

import { browser } from '$app/environment';
import { StatusBar, Style } from '@capacitor/status-bar';
import { IS_NATIVE } from '$lib/utils/platform';
import { prefs, DEFAULT_PREFS, type ThemeName } from './prefs';

const LIGHT_THEMES = new Set<ThemeName>(['light', 'cream', 'persimmon']);

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
		case 'persimmon':
			return '#fff8f4';
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

function applyTheme(theme: ThemeName, accent: string, fontScale: number): void {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', theme);
	// Reading-text size multiplier (calc(<px> * var(--font-scale)) on surfaces).
	document.documentElement.style.setProperty('--font-scale', String(fontScale || 1));
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

// Android 15 and later draw every app edge to edge: the page already sits
// behind the status bar and pads itself with env(safe-area-inset-top). A
// non-zero inset is how the page can tell.
function drawsEdgeToEdge(): boolean {
	const probe = document.createElement('div');
	probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden';
	document.body.appendChild(probe);
	const inset = probe.offsetHeight;
	probe.remove();
	return inset > 0;
}

export function initTheme(): void {
	if (!browser) return;
	if (IS_NATIVE && !drawsEdgeToEdge()) {
		// Older Android: ask the system to reserve the strip at the top so the
		// app bar doesn't disappear into the clock and battery icons.
		//
		// Not on edge-to-edge systems. There the request changes nothing about
		// the layout, but making it toggles window flags, and for a frame or
		// two the system paints its own grey bar across the status bar: a
		// visible flicker on every launch.
		StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
	}
	prefs.subscribe((v) => {
		applyTheme(v.theme, v.accent, v.fontScale);
	});
}
