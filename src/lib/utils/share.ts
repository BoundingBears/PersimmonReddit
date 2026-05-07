// Cross-platform share helper. Native devices get the system share sheet via
// Capacitor; web falls back to the Web Share API or clipboard.

import { Share } from '@capacitor/share';
import { IS_NATIVE } from './platform';
import { pushToast } from '$lib/stores/toast';
import { tick } from '$lib/utils/haptics';

export async function sharePost(opts: { url: string; title?: string }): Promise<void> {
	const { url, title } = opts;
	try {
		if (IS_NATIVE) {
			await Share.share({ url, title, dialogTitle: 'Share' });
			tick();
			return;
		}
		if (typeof navigator !== 'undefined' && navigator.share) {
			await navigator.share({ url, title });
			tick();
			return;
		}
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			await navigator.clipboard.writeText(url);
			pushToast('Link copied');
			tick();
		}
	} catch {
		// User cancelled or share failed — both are silent.
	}
}

export async function copyLink(url: string): Promise<void> {
	try {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(url);
		pushToast('Link copied');
		tick();
	} catch {
		pushToast('Could not copy link');
	}
}
