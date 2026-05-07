// Content-type detection. Mirrors the heuristics in Geddit's FullPost.vue but
// adds: gallery via gallery_data, crosspost unwrap, modern video detection.

import type { PostKind } from './types';

// Keep this loose — Reddit's JSON adds fields silently.
export interface RawPost {
	is_self?: boolean;
	is_video?: boolean;
	is_gallery?: boolean;
	gallery_data?: unknown;
	media?: { reddit_video?: unknown; type?: string } | null;
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
	if (raw.is_video || raw.media?.reddit_video) return 'video';

	const url = raw.url_overridden_by_dest ?? raw.url ?? '';
	if (raw.post_hint === 'image' || IMG_RE.test(url)) return 'image';
	if (raw.post_hint === 'hosted:video' || raw.post_hint === 'rich:video') return 'video';
	if (raw.media?.type) return 'embed';

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
