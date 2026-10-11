// "Open Reddit links in Persimmon": the state of Android's per-app link
// setting, and a way to reach it. See AppLinksPlugin.java for why the app has
// to ask the user to switch this on rather than doing it itself.

import { registerPlugin } from '@capacitor/core';
import { IS_NATIVE } from './platform';
import { expectAbsence } from '$lib/stores/lock';

interface AppLinksPlugin {
	getStatus(): Promise<{ supported: boolean; allowed?: boolean; total?: number; enabled?: number }>;
	openSettings(): Promise<void>;
}

const AppLinks = registerPlugin<AppLinksPlugin>('AppLinks');

export type LinkHandling =
	// Android 11 and older show their own "Open with" chooser. Nothing to set.
	| { kind: 'chooser' }
	// Android 12+: how many of our Reddit addresses the user has switched on.
	| { kind: 'setting'; enabled: number; total: number }
	// Not on Android, or the plugin is missing.
	| { kind: 'unavailable' };

export async function getLinkHandling(): Promise<LinkHandling> {
	if (!IS_NATIVE) return { kind: 'unavailable' };
	try {
		const s = await AppLinks.getStatus();
		if (!s.supported) return { kind: 'chooser' };
		const total = s.total ?? 0;
		// The master switch off means none of the per-address ticks count.
		const enabled = s.allowed === false ? 0 : (s.enabled ?? 0);
		return { kind: 'setting', enabled, total };
	} catch {
		return { kind: 'unavailable' };
	}
}

export async function openLinkHandlingSettings(): Promise<void> {
	try {
		expectAbsence();
		await AppLinks.openSettings();
	} catch (e) {
		console.error('could not open link settings', e);
	}
}
