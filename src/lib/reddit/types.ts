// Normalized shapes consumed by the UI. Raw Reddit JSON shapes (which are wide
// and undocumented) are kept loose and live in parsers.ts.

export type PostKind = 'text' | 'image' | 'video' | 'gallery' | 'embed' | 'link' | 'crosspost';

export interface MediaImage {
	url: string;
	width: number;
	height: number;
}

export interface MediaVideo {
	hlsUrl?: string;
	dashUrl?: string;
	fallbackUrl?: string;
	width: number;
	height: number;
	duration: number;
	isGif: boolean;
}

export interface GalleryItem {
	id: string;
	url: string;
	width: number;
	height: number;
	caption?: string;
}

export interface Embed {
	html: string;
	width: number;
	height: number;
	provider?: string;
}

export interface Post {
	id: string; // base36 id, e.g. "abc123"
	fullId: string; // "t3_abc123"
	kind: PostKind;
	title: string;
	subreddit: string;
	author: string;
	permalink: string; // e.g. "/r/pics/comments/abc123/title/"
	url: string; // outbound link or self link
	createdUtc: number;
	score: number;
	upvoteRatio: number;
	numComments: number;
	domain: string;
	flair?: { text: string; backgroundColor?: string; textColor?: string };
	authorFlair?: { text: string };
	over18: boolean;
	spoiler: boolean;
	stickied: boolean;
	locked: boolean;
	archived: boolean;
	sendReplies: boolean;
	thumbnail?: string; // never the literal "nsfw"/"spoiler"/"default"
	preview?: MediaImage; // best-effort preview image
	selftextHtml?: string;
	selftext?: string;
	image?: MediaImage;
	video?: MediaVideo;
	gallery?: GalleryItem[];
	embed?: Embed;
	crosspost?: Post; // unwrapped from crosspost_parent_list[0]
}

export interface Comment {
	kind: 'comment';
	id: string;
	fullId: string; // "t1_xyz"
	author: string;
	bodyHtml: string;
	body: string;
	score: number;
	scoreHidden: boolean;
	createdUtc: number;
	editedUtc: number | false;
	depth: number;
	permalink: string;
	stickied: boolean;
	isSubmitter: boolean;
	distinguished?: 'moderator' | 'admin' | null;
	authorFlair?: { text: string };
	replies: CommentNode[];
}

export interface MoreStub {
	kind: 'more';
	id: string;
	parentFullId: string;
	count: number; // total hidden replies under this stub
	childIds: string[]; // base36 ids to load
	depth: number;
}

export type CommentNode = Comment | MoreStub;

export interface Subreddit {
	name: string; // "pics" (no /r/)
	displayName: string;
	title: string;
	publicDescription: string;
	descriptionHtml: string;
	subscribers: number;
	activeUserCount: number;
	createdUtc: number;
	over18: boolean;
	iconImg?: string;
	communityIcon?: string;
	bannerImg?: string;
	primaryColor?: string;
}

export interface User {
	name: string;
	createdUtc: number;
	linkKarma: number;
	commentKarma: number;
	totalKarma: number;
	iconImg?: string;
	verified: boolean;
	isMod: boolean;
}

export interface Listing<T> {
	after: string | null;
	before: string | null;
	items: T[];
}

// Result type — every endpoint returns this so callers must handle errors
// explicitly instead of getting a silent `null` back.
export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: { status?: number; message: string; cause?: unknown } };

export type Sort = 'hot' | 'new' | 'top' | 'rising' | 'controversial' | 'best';
export type CommentSort = 'best' | 'top' | 'new' | 'controversial' | 'old' | 'qa' | 'confidence';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
