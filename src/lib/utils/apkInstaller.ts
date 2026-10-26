// In-app updater: download the release APK, then hand it to Android's package
// installer (see ApkInstallerPlugin.java).
//
// The old flow opened the GitHub release page in a browser and left the user to
// find the asset, download it, open it from notifications, and grant an install
// permission from a cold start. This gets them to the same system install
// dialog in one tap, with a progress bar in between.
//
// Android will not install silently for a sideloaded app — that needs
// device-owner or system privileges — so the platform's confirmation dialog is
// always shown. Every failure path falls back to opening the release page,
// which is exactly the old behaviour, so this can only be an improvement.

import { registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IS_NATIVE } from './platform';
import { expectAbsence } from '$lib/stores/lock';

interface ApkInstallerPlugin {
	// Has the user granted "install unknown apps" for Persimmon? (API 26+)
	canInstall(): Promise<{ granted: boolean }>;
	// Opens the system screen where that's granted.
	openInstallSettings(): Promise<void>;
	// Fires the package installer for an APK at `path`.
	install(options: { path: string }): Promise<void>;
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

export type InstallStage =
	| { stage: 'downloading'; percent: number }
	| { stage: 'installing' }
	| { stage: 'needs-permission' }
	| { stage: 'done' }
	| { stage: 'error'; message: string };

// Cache dir, so Android reclaims the ~4 MB on its own if the install is
// abandoned. Matches the <cache-path> entry in res/xml/file_paths.xml, which is
// what lets FileProvider serve it to the installer.
const APK_DIR = Directory.Cache;
const apkName = (version: string) => `persimmon-${version}.apk`;

export function canSelfInstall(): boolean {
	return IS_NATIVE;
}

/**
 * Download `apkUrl` and launch the installer, reporting progress via `onStage`.
 * Resolves true if the installer was launched, false if the caller should fall
 * back to opening the release page in a browser.
 */
export async function downloadAndInstall(
	apkUrl: string,
	version: string,
	onStage: (s: InstallStage) => void
): Promise<boolean> {
	if (!IS_NATIVE) return false;

	// Check the permission before spending the user's data on a download.
	try {
		const { granted } = await ApkInstaller.canInstall();
		if (!granted) {
			onStage({ stage: 'needs-permission' });
			return false;
		}
	} catch {
		// Plugin missing (older install, web build) — let the caller open the page.
		return false;
	}

	const path = apkName(version);
	let listener: { remove: () => void } | null = null;

	try {
		onStage({ stage: 'downloading', percent: 0 });

		listener = await Filesystem.addListener('progress', (e) => {
			// `contentLength` is 0 when the server sends no Content-Length; show
			// an indeterminate 0% rather than dividing by zero.
			const percent = e.contentLength > 0 ? Math.round((e.bytes / e.contentLength) * 100) : 0;
			onStage({ stage: 'downloading', percent });
		});

		const result = await Filesystem.downloadFile({
			url: apkUrl,
			path,
			directory: APK_DIR,
			progress: true,
			recursive: true
		});

		listener.remove();
		listener = null;

		if (!result.path) {
			onStage({ stage: 'error', message: 'Download produced no file' });
			return false;
		}

		onStage({ stage: 'installing' });
		expectAbsence();
		await ApkInstaller.install({ path: result.path });
		onStage({ stage: 'done' });
		return true;
	} catch (e) {
		listener?.remove();
		const message = e instanceof Error ? e.message : String(e);
		if (message.includes('PERMISSION_DENIED')) {
			// Revoked between the check above and the install.
			onStage({ stage: 'needs-permission' });
			return false;
		}
		console.error('apk install failed', e);
		onStage({ stage: 'error', message });
		return false;
	}
}

export async function openInstallPermissionSettings(): Promise<void> {
	try {
		expectAbsence();
		await ApkInstaller.openInstallSettings();
	} catch (e) {
		console.error('could not open install settings', e);
	}
}

/** Whether Android currently lets Persimmon install apps. */
export async function installAllowed(): Promise<boolean> {
	if (!IS_NATIVE) return false;
	try {
		return (await ApkInstaller.canInstall()).granted;
	} catch {
		return false;
	}
}
