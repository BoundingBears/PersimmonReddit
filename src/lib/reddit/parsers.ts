// Reddit JSON → app types. Components never touch raw Reddit shapes; they call
// these parsers and consume normalized values from types.ts.

import { detectKind, isPlaceholderThumbnail, type RawPost } from './media';
import type {
	Comment,
	CommentNode,
	GalleryItem,
	Listing,
	MediaImage,
	MoreStub,
	Post,
	Subreddit,
	User
} from './types';

// Reddit double-encodes ampersands inside HTML strings.
function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x200B;/g, '');
}

interface RawListing<T> {
	kind: 'Listing';
	data: { after: string | null; before: string | null; children: { kind: string; data: T }[] };
}

interface RawSubreddit {
	display_name: string;
	display_name_prefixed?: string;
	title: string;
	public_description: string;
	description_html?: string;
	subscribers: number;
	active_user_count?: number;
	created_utc: number;
	over18: boolean;
	icon_img?: string;
	community_icon?: string;
	banner_img?: string;
	primary_color?: string;
}

interface RawUser {
	name: string;
	created_utc: number;
	link_karma: number;
	comment_karma: number;
	total_karma?: number;
	icon_img?: string;
	verified?: boolean;
	is_mod?: boolean;
}

interface RawComment {
	id: string;
	name: string;
	author: string;
	body: string;
	body_html: string;
	score: number;
	score_hidden: boolean;
	created_utc: number;
	edited: number | false;
	depth?: number;
	permalink: string;
	stickied: boolean;
	is_submitter: boolean;
	distinguished?: 'moderator' | 'admin' | null;
	author_flair_text?: string;
	replies?: RawListing<RawComment | RawMore> | '';
}

interface RawMore {
	id: string;
	name: string;
	count: number;
	depth?: number;
	parent_id: string;
	children: string[];
}

// ---------- Posts ----------

function parsePreview(raw: any): MediaImage | undefined {
	const src = raw?.preview?.images?.[0]?.source;
	if (!src?.url) return undefined;
	return { url: decodeEntities(src.url), width: src.width ?? 0, height: src.height ?? 0 };
}

function parseImage(raw: any): MediaImage | undefined {
	const url = raw.url_overridden_by_dest ?? raw.url;
	if (!url) return undefined;
	const src = raw?.preview?.images?.[0]?.source;
	return {
		url: decodeEntities(url),
		width: src?.width ?? 0,
		height: src?.height ?? 0
	};
}

function parseVideo(raw: any) {
	const v = raw?.media?.reddit_video ?? raw?.secure_media?.reddit_video;
	if (!v) return undefined;
	return {
		hlsUrl: v.hls_url ? decodeEntities(v.hls_url) : undefined,
		dashUrl: v.dash_url ? decodeEntities(v.dash_url) : undefined,
		fallbackUrl: v.fallback_url,
		width: v.width ?? 0,
		height: v.height ?? 0,
		duration: v.duration ?? 0,
		isGif: !!v.is_gif
	};
}

function parseGallery(raw: any): GalleryItem[] | undefined {
	const items = raw?.gallery_data?.items;
	const meta = raw?.media_metadata;
	if (!Array.isArray(items) || !meta) return undefined;
	const out: GalleryItem[] = [];
	for (const it of items) {
		const m = meta[it.media_id];
		if (!m || m.status !== 'valid' || !m.s) continue;
		// `s.u` is the full image URL; for animated, `s.gif` is preferred. `m.m`
		// looks like "image/jpg" / "image/gif".
		const url = m.s.gif ?? m.s.u ?? m.s.mp4;
		if (!url) continue;
		out.push({
			id: it.media_id,
			url: decodeEntities(url),
			width: m.s.x ?? 0,
			height: m.s.y ?? 0,
			caption: it.caption ?? undefined
		});
	}
	return out.length > 0 ? out : undefined;
}

function parseEmbed(raw: any) {
	const e = raw?.media_embed ?? raw?.secure_media_embed;
	if (!e?.content) return undefined;
	return {
		html: decodeEntities(e.content),
		width: e.width ?? 0,
		height: e.height ?? 0,
		provider: raw?.media?.type
	};
}

function parseFlair(text: string | undefined, bg?: string, textColor?: string) {
	if (!text) return undefined;
	return { text, backgroundColor: bg || undefined, textColor: textColor || undefined };
}

export function parsePost(raw: any): Post {
	const kind = detectKind(raw as RawPost);
	const thumbRaw = raw.thumbnail;
	const thumbnail = isPlaceholderThumbnail(thumbRaw) ? undefined : decodeEntities(thumbRaw);

	const post: Post = {
		id: raw.id,
		fullId: raw.name,
		kind,
		title: raw.title,
		subreddit: raw.subreddit,
		author: raw.author,
		permalink: raw.permalink,
		url: raw.url_overridden_by_dest ?? raw.url,
		createdUtc: raw.created_utc,
		score: raw.score,
		upvoteRatio: raw.upvote_ratio ?? 0,
		numComments: raw.num_comments,
		domain: raw.domain,
		flair: parseFlair(raw.link_flair_text, raw.link_flair_background_color, raw.link_flair_text_color),
		authorFlair: raw.author_flair_text ? { text: raw.author_flair_text } : undefined,
		over18: !!raw.over_18,
		spoiler: !!raw.spoiler,
		stickied: !!raw.stickied,
		locked: !!raw.locked,
		archived: !!raw.archived,
		sendReplies: !!raw.send_replies,
		thumbnail,
		preview: parsePreview(raw),
		selftextHtml: raw.selftext_html ? decodeEntities(raw.selftext_html) : undefined,
		selftext: raw.selftext || undefined
	};

	if (kind === 'image') post.image = parseImage(raw);
	if (kind === 'video') post.video = parseVideo(raw);
	if (kind === 'gallery') post.gallery = parseGallery(raw);
	if (kind === 'embed') post.embed = parseEmbed(raw);
	if (kind === 'crosspost') {
		const cp = raw.crosspost_parent_list?.[0];
		if (cp) post.crosspost = parsePost(cp);
	}
	return post;
}

export function parsePostListing(raw: RawListing<any>): Listing<Post> {
	const items: Post[] = [];
	for (const child of raw.data.children) {
		if (child.kind !== 't3') continue;
		try {
			items.push(parsePost(child.data));
		} catch (e) {
			// One malformed post shouldn't break the whole feed.
			console.error('parsePost failed for', child.data?.id, e);
		}
	}
	return { after: raw.data.after, before: raw.data.before, items };
}

// ---------- Comments ----------

export function parseComment(raw: any, depth = 0): CommentNode {
	if (raw.kind === 'more') {
		const m = raw.data as RawMore;
		const stub: MoreStub = {
			kind: 'more',
			id: m.id,
			parentFullId: m.parent_id,
			count: m.count,
			childIds: m.children ?? [],
			depth: m.depth ?? depth
		};
		return stub;
	}
	const c = raw.data as RawComment;
	const replies: CommentNode[] = [];
	if (c.replies && typeof c.replies === 'object') {
		for (const child of c.replies.data.children) {
			replies.push(parseComment(child, (c.depth ?? depth) + 1));
		}
	}
	return {
		kind: 'comment',
		id: c.id,
		fullId: c.name,
		author: c.author,
		bodyHtml: c.body_html ? decodeEntities(c.body_html) : '',
		body: c.body ?? '',
		score: c.score,
		scoreHidden: !!c.score_hidden,
		createdUtc: c.created_utc,
		editedUtc: c.edited,
		depth: c.depth ?? depth,
		permalink: c.permalink,
		stickied: !!c.stickied,
		isSubmitter: !!c.is_submitter,
		distinguished: c.distinguished ?? null,
		authorFlair: c.author_flair_text ? { text: c.author_flair_text } : undefined,
		replies
	};
}

export function parseCommentListing(raw: any): CommentNode[] {
	if (!raw?.data?.children) return [];
	return raw.data.children.map((c: any) => parseComment(c, 0));
}

// /comments/<id>.json returns a 2-element array: [post-listing, comment-listing]
export function parseSubmissionAndComments(raw: any): { post: Post; comments: CommentNode[] } {
	const post = parsePost(raw[0].data.children[0].data);
	const comments = parseCommentListing(raw[1]);
	return { post, comments };
}

// ---------- Subreddit / User ----------

export function parseSubreddit(raw: RawSubreddit): Subreddit {
	return {
		name: raw.display_name,
		displayName: raw.display_name_prefixed ?? `r/${raw.display_name}`,
		title: raw.title ?? '',
		publicDescription: raw.public_description ?? '',
		descriptionHtml: raw.description_html ? decodeEntities(raw.description_html) : '',
		subscribers: raw.subscribers ?? 0,
		activeUserCount: raw.active_user_count ?? 0,
		createdUtc: raw.created_utc,
		over18: !!raw.over18,
		iconImg: raw.icon_img ? decodeEntities(raw.icon_img) : undefined,
		communityIcon: raw.community_icon ? decodeEntities(raw.community_icon) : undefined,
		bannerImg: raw.banner_img ? decodeEntities(raw.banner_img) : undefined,
		primaryColor: raw.primary_color || undefined
	};
}

export function parseSubredditListing(raw: RawListing<RawSubreddit>): Listing<Subreddit> {
	return {
		after: raw.data.after,
		before: raw.data.before,
		items: raw.data.children
			.filter((c) => c.kind === 't5')
			.map((c) => parseSubreddit(c.data))
	};
}

export function parseUser(raw: any): User {
	const d = raw.data ?? raw; // /user/x/about wraps in {data}
	return {
		name: d.name,
		createdUtc: d.created_utc,
		linkKarma: d.link_karma ?? 0,
		commentKarma: d.comment_karma ?? 0,
		totalKarma: d.total_karma ?? (d.link_karma ?? 0) + (d.comment_karma ?? 0),
		iconImg: d.icon_img ? decodeEntities(d.icon_img) : d.snoovatar_img || undefined,
		verified: !!d.verified,
		isMod: !!d.is_mod
	};
}

// /user/<u>/overview returns a mixed listing of t1 (comments) and t3 (posts).
export function parseUserOverview(
	raw: RawListing<any>
): Listing<{ kind: 'post'; post: Post } | { kind: 'comment'; comment: Comment }> {
	const items: Array<{ kind: 'post'; post: Post } | { kind: 'comment'; comment: Comment }> = [];
	for (const c of raw.data.children) {
		if (c.kind === 't3') items.push({ kind: 'post', post: parsePost(c.data) });
		else if (c.kind === 't1') {
			const parsed = parseComment(c, 0);
			if (parsed.kind === 'comment') items.push({ kind: 'comment', comment: parsed });
		}
	}
	return { after: raw.data.after, before: raw.data.before, items };
}
