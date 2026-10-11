// Map Reddit URLs to Persimmon's internal routes. Used by the deep-link handler
// when a Reddit link is opened from a browser, a chat app, or the share sheet.
//
// The common entry point is a Google result: searching Reddit through Google
// and tapping the hit. That lands here as a plain www.reddit.com post URL.
//
// Returns the internal route (which may carry a query string, e.g. a search),
// or null for URLs with no equivalent screen (/message, /settings, ...). A
// share link needs a network round trip to resolve, so it is reported
// separately through isShareLink() and the caller resolves it first.

export interface ParsedRedditUrl {
	/** Internal route, safe to hand to goto(). May include a query string. */
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
	'np.reddit.com',
	'amp.reddit.com',
	'sh.reddit.com'
]);

// Listing sorts that can trail a feed URL: /r/pics/top, /hot, ...
const SORTS = new Set(['hot', 'new', 'top', 'rising', 'best', 'controversial']);
// Reddit post ids are base36.
const POST_ID = /^[a-z0-9]{2,12}$/i;

function parse(input: string): { host: string; segments: string[]; url: URL } | null {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	return { host: url.hostname.toLowerCase(), segments: url.pathname.split('/').filter(Boolean), url };
}

/**
 * Share links (reddit.com/r/pics/s/AbC123, made by Reddit's Share button) hide
 * the post id behind a redirect. They cannot be mapped offline.
 */
export function isShareLink(input: string): boolean {
	const p = parse(input);
	if (!p || !REDDIT_HOSTS.has(p.host)) return false;
	const s = p.segments;
	return (s[0] === 'r' || s[0] === 'u' || s[0] === 'user') && s[2] === 's' && !!s[3];
}

function post(id: string | undefined): ParsedRedditUrl | null {
	return id && POST_ID.test(id) ? { pathname: `/comments/${id.toLowerCase()}` } : null;
}

function search(url: URL): ParsedRedditUrl | null {
	const q = url.searchParams.get('q')?.trim();
	return q ? { pathname: `/search?q=${encodeURIComponent(q)}` } : { pathname: '/search' };
}

export function parseRedditUrl(input: string): ParsedRedditUrl | null {
	const p = parse(input);
	if (!p) return null;
	const { host, segments, url } = p;

	// Short link: redd.it/<id>
	if (SHORT_HOSTS.has(host)) return post(segments[0]);

	if (!REDDIT_HOSTS.has(host)) return null;
	if (isShareLink(input)) return null;

	const [a, b, c, d] = segments;

	// The front page, with or without a sort.
	if (!a || (SORTS.has(a) && !b)) return { pathname: '/' };

	if (a === 'r' && b) {
		// /r/<sub>/comments/<id>[/<slug>[/<comment>]]
		if (c === 'comments') return post(d) ?? { pathname: `/r/${b}` };
		// /r/<sub>/search?q=...
		if (c === 'search') return search(url);
		// /r/<sub>, /r/<sub>/top, /r/<sub>/about, /r/<sub>/wiki/...
		return { pathname: `/r/${b}` };
	}

	// /comments/<id>, and the per-type permalinks that are the same post.
	if (a === 'comments' || a === 'gallery' || a === 'poll' || a === 'video') return post(b);

	if ((a === 'u' || a === 'user') && b) {
		// A post made on a profile: /user/<name>/comments/<id>/...
		if (c === 'comments') return post(d) ?? { pathname: `/u/${b}` };
		return { pathname: `/u/${b}` };
	}

	if (a === 'search') return search(url);
	if (a === 'subreddits') return { pathname: '/subreddits' };

	return null;
}
