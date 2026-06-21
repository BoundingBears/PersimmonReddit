// Wire Capacitor's deep-link events to SvelteKit's router via parseRedditUrl.
// Returns a cleanup function that removes the listener.
//
// Two entry points to handle:
//   - getLaunchUrl(): the URL the app was launched with (cold start).
//   - addListener('appUrlOpen', …): URLs that arrive while the app is already
//     running (warm start — most common case when sharing from another app).

import { App } from '@capacitor/app';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { IS_NATIVE } from './platform';
import { parseRedditUrl } from './parseRedditUrl';

function route(url: string): void {
	// Shared text can arrive as "check this out https://reddit.com/…" — pull the
	// first URL out before parsing. (Native already does this for SEND intents;
	// this is defense-in-depth for any caller that passes raw text.)
	const match = url.match(/https?:\/\/\S+/);
	const parsed = parseRedditUrl(match ? match[0] : url);
	if (!parsed) {
		console.info('deep-link: ignoring unrecognized URL', url);
		return;
	}
	goto(parsed.pathname);
}

export function installDeepLinks(): () => void {
	if (!browser || !IS_NATIVE) return () => {};

	// Cold-start launch URL — fire-and-forget. Routes if a Reddit URL launched
	// the app; no-op otherwise.
	App.getLaunchUrl()
		.then((res) => {
			if (res?.url) route(res.url);
		})
		.catch(() => undefined);

	// Warm-start listener. Mirrors the drawer's backButton pattern: the
	// listener handle is async, so we may need to remove it before it
	// resolves (cancel flag).
	let removeFn: (() => void) | null = null;
	let cancelled = false;

	App.addListener('appUrlOpen', (event: { url: string }) => {
		route(event.url);
	}).then((handle) => {
		if (cancelled) {
			handle.remove();
		} else {
			removeFn = () => handle.remove();
		}
	});

	return () => {
		cancelled = true;
		removeFn?.();
	};
}
