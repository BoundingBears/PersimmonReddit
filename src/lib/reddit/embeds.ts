// Turn an outbound URL into a player we can iframe directly.
//
// Reddit's own `media_embed.content` is an Embedly wrapper, and for some
// providers that wrapper cannot work inside this app:
//
//   - Twitch only loads when every ancestor frame is listed in its `parent`
//     params. Reddit lists reddit.com and embedly.com; our page is
//     https://localhost, so the clip rendered as a blank white box.
//   - For many third-party videos (`post_hint: "rich:video"`) the embed never
//     reached the UI at all, see detectKind in media.ts.
//
// Building the provider's own embed URL avoids both problems, drops a
// third-party hop, and also gives an inline player to plain link posts that
// Reddit attached no media object to.
//
// Every pattern here was checked against live posts in the Android WebView.

export interface DirectEmbed {
	provider: 'youtube' | 'twitch' | 'streamable' | 'vimeo';
	src: string;
	// height / width. Portrait for YouTube Shorts, landscape otherwise.
	aspect: number;
}

const LANDSCAPE = 9 / 16;
const PORTRAIT = 16 / 9;

function parseUrl(raw: string): URL | null {
	try {
		return new URL(raw);
	} catch {
		return null;
	}
}

// "1h2m3s", "90s", "90" -> seconds
function parseStart(v: string | null): number {
	if (!v) return 0;
	if (/^\d+$/.test(v)) return Number(v);
	const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
	if (!m) return 0;
	return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtube(u: URL): DirectEmbed | null {
	const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
	let id: string | null = null;
	let portrait = false;
	if (host === 'youtu.be') {
		id = u.pathname.split('/')[1] ?? null;
	} else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts[0] === 'watch') id = u.searchParams.get('v');
		else if (parts[0] === 'shorts') {
			id = parts[1] ?? null;
			portrait = true;
		} else if (parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') id = parts[1] ?? null;
	}
	if (!id || !YT_ID.test(id)) return null;
	const start = parseStart(u.searchParams.get('t') ?? u.searchParams.get('start'));
	// youtube-nocookie is YouTube's privacy-enhanced player: same video, no
	// tracking cookies until playback starts.
	const params = new URLSearchParams({ playsinline: '1', rel: '0', autoplay: '1' });
	if (start > 0) params.set('start', String(start));
	return {
		provider: 'youtube',
		src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
		aspect: portrait ? PORTRAIT : LANDSCAPE
	};
}

function twitch(u: URL, parentHost: string): DirectEmbed | null {
	const host = u.hostname.replace(/^(www\.|m\.)/, '');
	const parts = u.pathname.split('/').filter(Boolean);
	const parent = encodeURIComponent(parentHost);
	let clip: string | null = null;
	if (host === 'clips.twitch.tv') {
		// clips.twitch.tv/<slug>  (or /embed?clip=<slug>)
		clip = parts[0] === 'embed' ? u.searchParams.get('clip') : (parts[0] ?? null);
	} else if (host === 'twitch.tv') {
		// twitch.tv/<channel>/clip/<slug>  or  twitch.tv/clip/<slug>
		const i = parts.indexOf('clip');
		if (i >= 0) clip = parts[i + 1] ?? null;
		else if (parts[0] === 'videos' && /^\d+$/.test(parts[1] ?? '')) {
			return {
				provider: 'twitch',
				src: `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}&autoplay=true`,
				aspect: LANDSCAPE
			};
		}
	}
	if (!clip || !/^[A-Za-z0-9_-]+$/.test(clip)) return null;
	return {
		provider: 'twitch',
		src: `https://clips.twitch.tv/embed?clip=${clip}&parent=${parent}&autoplay=true`,
		aspect: LANDSCAPE
	};
}

function streamable(u: URL): DirectEmbed | null {
	if (u.hostname.replace(/^www\./, '') !== 'streamable.com') return null;
	const parts = u.pathname.split('/').filter(Boolean);
	const id = parts[0] === 'e' || parts[0] === 'o' ? parts[1] : parts[0];
	if (!id || !/^[a-z0-9]+$/i.test(id)) return null;
	return { provider: 'streamable', src: `https://streamable.com/e/${id}?autoplay=1`, aspect: LANDSCAPE };
}

function vimeo(u: URL): DirectEmbed | null {
	const host = u.hostname.replace(/^www\./, '');
	if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
	const id = u.pathname.split('/').filter(Boolean).find((p) => /^\d+$/.test(p));
	if (!id) return null;
	return { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}?autoplay=1`, aspect: LANDSCAPE };
}

/**
 * @param parentHost hostname of the page doing the embedding. Twitch requires
 *   it; in the app that is "localhost".
 */
export function resolveEmbed(rawUrl: string | undefined, parentHost = 'localhost'): DirectEmbed | null {
	if (!rawUrl) return null;
	const u = parseUrl(rawUrl);
	if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
	return youtube(u) ?? twitch(u, parentHost) ?? streamable(u) ?? vimeo(u);
}

export function isEmbeddableUrl(rawUrl: string | undefined): boolean {
	return resolveEmbed(rawUrl) !== null;
}
