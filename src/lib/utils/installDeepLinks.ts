// Wire Capacitor's deep-link events to SvelteKit's router via parseRedditUrl.
// Returns a cleanup function that removes the listener.
//
// Two entry points to handle:
//   - getLaunchUrl(): the URL the app was launched with (cold start).
//   - addListener('appUrlOpen', ...): URLs that arrive while the app is already
//     running (warm start, the usual case when coming from a browser).

import { App } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { IS_NATIVE } from './platform';
import { isShareLink, parseRedditUrl } from './parseRedditUrl';
import { RedditFetch } from '$lib/reddit/redditFetch';
import { dismissToastByKey, pushToast } from '$lib/stores/toast';
import { Encoding, Filesystem } from '@capacitor/filesystem';
import { incomingBackup, parseBackup } from './backup';

const RESOLVE_TIMEOUT_MS = 8000;

// A share link is a redirect to the real post. Follow it and report where it
// leads. Plain HTTP first; if Reddit refuses that, a real navigation.
async function resolveShareLink(url: string): Promise<string | null> {
	try {
		const res = await CapacitorHttp.get({
			url,
			headers: { Accept: 'text/html' },
			connectTimeout: RESOLVE_TIMEOUT_MS,
			readTimeout: RESOLVE_TIMEOUT_MS
		});
		if (typeof res.url === 'string' && res.url && !isShareLink(res.url)) return res.url;
	} catch {
		// fall through
	}
	try {
		const res = await RedditFetch.get({ url });
		if (res.url && !isShareLink(res.url)) return res.url;
	} catch {
		// fall through
	}
	return null;
}

/**
 * A file the user opened with Persimmon from a file manager. The only kind it
 * knows is its own backup: read it, and hand it to Settings to ask whether to
 * merge it or replace what is here.
 */
async function openBackupFile(uri: string): Promise<void> {
	let text: string;
	try {
		const res = await Filesystem.readFile({ path: uri, encoding: Encoding.UTF8 });
		text = res.data as string;
	} catch (e) {
		console.error('could not read the opened file', uri, e);
		pushToast("Couldn't read that file", { key: 'deeplink', replace: true });
		return;
	}
	let backup = null;
	try {
		backup = parseBackup(JSON.parse(text));
	} catch {
		// not JSON at all
	}
	if (!backup) {
		pushToast("That file isn't a Persimmon backup", { key: 'deeplink', replace: true });
		return;
	}
	incomingBackup.set(backup);
	await goto('/settings');
}

// Everything Android can hand the app: a Reddit link, or a file.
function open(url: string): Promise<void> {
	return /^(content|file):/i.test(url) ? openBackupFile(url) : openRedditLink(url);
}

/**
 * Go to whatever a Reddit link points at: a post, a subreddit, a profile.
 * Used for links Android hands to the app and for a link pasted into Search.
 */
export async function openRedditLink(raw: string): Promise<void> {
	// Shared text can arrive as "check this out https://reddit.com/...": pull the
	// first URL out before parsing. (Native already does this for SEND intents;
	// this is defense in depth for any caller that passes raw text.)
	const match = raw.match(/https?:\/\/\S+/);
	let url = match ? match[0] : raw;

	if (isShareLink(url)) {
		pushToast('Opening link…', { key: 'deeplink', replace: true, duration: RESOLVE_TIMEOUT_MS });
		const resolved = await resolveShareLink(url);
		if (!resolved) {
			pushToast("Couldn't open that Reddit link", { key: 'deeplink', replace: true });
			return;
		}
		url = resolved;
	}

	const parsed = parseRedditUrl(url);
	if (!parsed) {
		// Say so. The app has just come to the front for this link, and doing
		// nothing at all reads as the app being broken.
		console.info('deep-link: no screen for', url);
		pushToast("Persimmon can't show that Reddit page", { key: 'deeplink', replace: true });
		return;
	}
	dismissToastByKey('deeplink');
	await goto(parsed.pathname);
}

export function installDeepLinks(): () => void {
	if (!browser || !IS_NATIVE) return () => {};

	// Cold-start launch URL. Routes if a Reddit URL launched the app; no-op
	// otherwise.
	App.getLaunchUrl()
		.then((res) => {
			if (res?.url) void open(res.url);
		})
		.catch(() => undefined);

	// Warm-start listener. The listener handle is async, so we may need to
	// remove it before it resolves (cancel flag).
	let removeFn: (() => void) | null = null;
	let cancelled = false;

	App.addListener('appUrlOpen', (event: { url: string }) => {
		void open(event.url);
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
