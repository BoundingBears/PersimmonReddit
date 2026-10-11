// Content-type detection. Mirrors the heuristics in Geddit's FullPost.vue but
// adds: gallery via gallery_data, crosspost unwrap, modern video detection.

import type { PostKind } from './types';
import { isEmbeddableUrl } from './embeds';

// Keep this loose — Reddit's JSON adds fields silently.
export interface RawPost {
	is_self?: boolean;
	is_video?: boolean;
	is_gallery?: boolean;
	gallery_data?: unknown;
	media?: { reddit_video?: unknown; type?: string } | null;
	secure_media?: { reddit_video?: unknown; type?: string } | null;
	media_embed?: { content?: string } | null;
	secure_media_embed?: { content?: string } | null;
	post_hint?: string;
	url?: string;
	url_overridden_by_dest?: string;
	domain?: string;
	crosspost_parent_list?: RawPost[];
}

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)(?:\?|$)/i;

export function detectKind(raw: RawPost): PostKind {
	if (raw.crosspost_parent_list && raw.crosspost_parent_list.length > 0) {
		return 'crosspost';
	}
	if (raw.is_self) return 'text';
	if (raw.is_gallery && raw.gallery_data) return 'gallery';
	// 'video' means Reddit-hosted (v.redd.it) and nothing else: it is the only
	// kind VideoView can play.
	if (raw.is_video || raw.media?.reddit_video || raw.secure_media?.reddit_video) return 'video';

	const url = raw.url_overridden_by_dest ?? raw.url ?? '';
	if (raw.post_hint === 'image' || IMG_RE.test(url)) return 'image';
	if (raw.post_hint === 'hosted:video') return 'video';
	// `rich:video` is Reddit's hint for a THIRD-PARTY player (YouTube,
	// Streamable, Twitch...). It used to be classed as 'video', which has no
	// reddit_video to play, so the post rendered no media at all: roughly one
	// post in four on video-heavy subs.
	if (
		raw.post_hint === 'rich:video' ||
		raw.media?.type ||
		raw.secure_media?.type ||
		raw.media_embed?.content ||
		raw.secure_media_embed?.content
	) {
		return 'embed';
	}
	// A known provider URL that Reddit attached no media object to still gets
	// an inline player (common for plain youtu.be links).
	if (isEmbeddableUrl(url)) return 'embed';

	// Reddit's i.imgur and v.redd.it sometimes show up without post_hint.
	if (raw.domain === 'i.imgur.com' || raw.domain === 'i.redd.it') return 'image';
	if (raw.domain === 'v.redd.it') return 'video';

	return 'link';
}

// Reddit returns these as literal strings instead of URLs for NSFW / spoiler
// posts. Filter at the parser layer so the UI never sees them.
export function isPlaceholderThumbnail(s: string | undefined): boolean {
	if (!s) return true;
	return s === 'nsfw' || s === 'spoiler' || s === 'default' || s === 'self' || s === 'image';
}
