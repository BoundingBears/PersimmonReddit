// Map Reddit URLs to Persimmon's internal route paths. Used by the deep-link
// handler that fires when Android's "Open with…" sheet routes a Reddit link
// into the app.
//
// Returns the matching internal pathname, or null for URLs we don't handle
// (e.g. /messages, /me, /preferences). Caller decides what to do with null
// (silently no-op for v1.0.5).

export interface ParsedRedditUrl {
	pathname: string;
}

const SHORT_HOSTS = new Set(['redd.it']);
const REDDIT_HOSTS = new Set([
	'reddit.com',
	'www.reddit.com',
	'old.reddit.com',
	'new.reddit.com',
	'm.reddit.com',
	'i.reddit.com',
	'np.reddit.com'
]);

export function parseRedditUrl(input: string): ParsedRedditUrl | null {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}

	const host = url.hostname.toLowerCase();
	const segments = url.pathname.split('/').filter(Boolean);

	// Short link: redd.it/<id> → /comments/<id>
	if (SHORT_HOSTS.has(host)) {
		const id = segments[0];
		return id ? { pathname: `/comments/${id}` } : null;
	}

	if (!REDDIT_HOSTS.has(host)) return null;

	// /r/<sub>/comments/<id>/...                    → /comments/<id>
	// /r/<sub>[/sort | /about | etc]                → /r/<sub>
	if (segments[0] === 'r' && segments[1]) {
		const sub = segments[1];
		if (segments[2] === 'comments' && segments[3]) {
			return { pathname: `/comments/${segments[3]}` };
		}
		return { pathname: `/r/${sub}` };
	}

	// /comments/<id>                                → /comments/<id>
	if (segments[0] === 'comments' && segments[1]) {
		return { pathname: `/comments/${segments[1]}` };
	}

	// /u/<user> and /user/<user>                    → /u/<user>
	if ((segments[0] === 'u' || segments[0] === 'user') && segments[1]) {
		return { pathname: `/u/${segments[1]}` };
	}

	return null;
}
