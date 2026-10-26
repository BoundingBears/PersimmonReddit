// Shared "install this update" action, used by both the top banner and the
// Settings row so the two can't drift apart or run at the same time.
//
// Order of preference:
//   1. Download the .apk asset and hand it to Android's package installer.
//   2. Anything missing or refused — no native plugin, no .apk on the release,
//      permission denied, download failed — open the release page in a browser,
//      which is what the app did before the installer existed.

import { get, writable } from 'svelte/store';
import { updateAvailable, knownUpdate, clearUpdateBanner, updateSheetOpen, type UpdateInfo } from './updateCheck';
import { pushToast } from './toast';
import {
	canSelfInstall,
	downloadAndInstall,
	installAllowed,
	openInstallPermissionSettings,
	type InstallStage
} from '$lib/utils/apkInstaller';
import { openExternal } from '$lib/utils/openExternal';

export const installState = writable<InstallStage | null>(null);

// The update that stopped at Android's "allow installing apps" switch. When
// the user comes back from that screen with the switch on, the install
// carries on by itself (resumeAfterPermission). It used to stop there: the
// user had to know to come back and press Update a second time.
let waitingForPermission: UpdateInfo | null = null;

/** Android's screen with the "allow from this source" switch. */
export async function allowInstalls(): Promise<void> {
	await openInstallPermissionSettings();
}

/** Back in the app (the layout calls this): carry on if the switch is now on. */
export async function resumeAfterPermission(): Promise<void> {
	const info = waitingForPermission;
	if (!info || !(await installAllowed())) return;
	waitingForPermission = null;
	installState.set(null);
	await startUpdate(info);
}

function busy(): boolean {
	const s = get(installState);
	return s?.stage === 'downloading' || s?.stage === 'installing';
}

async function fallbackToBrowser(info: UpdateInfo): Promise<void> {
	// Only close the banner once the page actually opened — if the browser
	// failed to launch, leave it up so the user can retry.
	if (await openExternal(info.url)) clearUpdateBanner();
}

export async function startUpdate(explicit?: UpdateInfo | null): Promise<void> {
	const info = explicit ?? get(updateAvailable) ?? get(knownUpdate);
	if (!info || busy()) return;

	if (!canSelfInstall() || !info.apkUrl) {
		await fallbackToBrowser(info);
		return;
	}

	const launched = await downloadAndInstall(info.apkUrl, info.version, (s) =>
		installState.set(s)
	);

	if (launched) {
		// The system installer is now in front of the user. Drop the banner for
		// this session; if they cancel the install, the next check brings it back.
		clearUpdateBanner();
		updateSheetOpen.set(false);
		installState.set(null);
		return;
	}

	const state = get(installState);
	if (state?.stage === 'needs-permission') {
		// The sheet explains and offers the switch (UpdateSheet.svelte); from
		// the banner or Settings, go straight to it.
		waitingForPermission = info;
		if (!get(updateSheetOpen)) await allowInstalls();
		return;
	}

	installState.set(null);
	pushToast("Couldn't install automatically. Opening the release page.");
	await fallbackToBrowser(info);
}
