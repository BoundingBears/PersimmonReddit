// Offline copies of saved posts.
//
// Saving a post already keeps a line about it on the device (saved.ts). This
// keeps the post itself: its text, its comments as they were, and the pictures
// at the size the app shows them. A saved post then opens with no connection.
//
// There is no separate "download" action to learn. Saved means kept:
//   - a post is copied when it is saved, and the copy is removed when it is
//     unsaved;
//   - opening a saved post while online quietly refreshes its copy, which is
//     also how posts saved before this existed get one.
//
// Not kept: video (Reddit serves picture and sound as separate streams that
// would have to be joined), full-size originals, and pictures inside comments.
//
// Layout on disk, under the app's private data directory:
//   offline/<id>/post.json          an OfflineCopy
//   offline/<id>/<hash>.<ext>       its pictures
//   private/offline/<id>/...        the same, for posts in the private folder
// A copy stores the post as Reddit sent it plus a map from each picture's URL
// to its file name. The URLs are swapped for the local files when the copy is
// READ, not when it is written, so a copy does not know or care which folder
// it is in: moving a post into or out of the private folder is one rename.

import { get, writable } from 'svelte/store';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { browser } from '$app/environment';
import { getSubmissionComments } from '$lib/reddit/endpoints';
import { IS_NATIVE } from '$lib/utils/platform';
import { saved, savedReady } from './saved';
import { PRIVATE_DIR, isPrivate, privatePosts, privateReady } from './privatePosts';
import type { CommentNode, Post } from '$lib/reddit/types';

/** What is on disk. */
interface StoredCopy {
	v: 2;
	// When the copy was last written.
	at: number;
	post: Post;
	comments: CommentNode[];
	// Remote picture URL to the name of the file standing in for it. Also what
	// lets a refresh of the copy skip pictures it already has.
	media: Record<string, string>;
}

/** What a reader gets: the post with its pictures pointing at the device. */
export interface OfflineCopy {
	at: number;
	post: Post;
	comments: CommentNode[];
}

export type Collection = 'saved' | 'private';
const ROOTS: Record<Collection, string> = { saved: 'offline', private: `${PRIVATE_DIR}/offline` };
const DIRECTORY = Directory.Data;

// Which folder a post's copy belongs in, or null if it is in neither list.
function collectionOf(id: string): Collection | null {
	if (isPrivate(id)) return 'private';
	return get(saved).has(id) ? 'saved' : null;
}
// Inline pictures in a post's own text, beyond its main media.
const MAX_TEXT_IMAGES = 10;
const PARALLEL_DOWNLOADS = 3;
// Saved posts are copied one at a time with a pause between, so undoing a
// "clear all" does not fire a burst of requests at Reddit.
const QUEUE_GAP_MS = 1500;

/** Ids of saved posts that have a copy on the device. */
export const offlineIds = writable<Set<string>>(new Set());

function mark(id: string, present: boolean) {
	offlineIds.update((s) => {
		if (s.has(id) === present) return s;
		const next = new Set(s);
		if (present) next.add(id);
		else next.delete(id);
		return next;
	});
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(?=$|[?#])/i;
function extensionOf(url: string): string {
	const m = url.match(IMAGE_EXT);
	if (m) return m[1].toLowerCase();
	// Reddit's resized pictures say what they are in the query instead.
	if (/[?&]format=pjpg/.test(url)) return 'jpg';
	if (/[?&]format=png/.test(url)) return 'png';
	return 'jpg';
}

const isGif = (url: string) => /\.gif(\?|$)/i.test(url);

// A short stable name for a URL, so a picture always lands in the same file.
function nameOf(url: string): string {
	let h = 2166136261;
	for (let i = 0; i < url.length; i++) {
		h ^= url.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return `${(h >>> 0).toString(36)}.${extensionOf(url)}`;
}

// Picture URLs written into a post's HTML, as they appear there (still
// entity-encoded) and as they must be requested.
function textImages(html: string | undefined): Array<{ raw: string; url: string }> {
	if (!html) return [];
	const found = new Map<string, string>();
	const re = /https:\/\/(?:preview|i|external-preview)\.redd\.it\/[^\s"'<>)]+/g;
	for (const m of html.matchAll(re)) {
		const raw = m[0];
		if (!found.has(raw)) found.set(raw, raw.replace(/&amp;/g, '&'));
		if (found.size >= MAX_TEXT_IMAGES) break;
	}
	return [...found].map(([raw, url]) => ({ raw, url }));
}

// Every picture the post page would show for this post.
function picturesOf(post: Post): string[] {
	const urls = new Set<string>();
	const add = (u?: string) => {
		if (u && /^https?:\/\//.test(u)) urls.add(u);
	};
	const visit = (p: Post) => {
		add(p.thumbnail);
		add(p.preview?.url);
		// The inline picture is the screen-sized rendition, except for GIFs
		// (only the real file animates) and pictures that have no rendition.
		if (p.image && (isGif(p.image.url) || !p.preview)) add(p.image.url);
		for (const item of p.gallery ?? []) add(item.url);
		for (const t of textImages(p.selftextHtml)) add(t.url);
		if (p.crosspost) visit(p.crosspost);
	};
	visit(post);
	return [...urls];
}

// The same post with its pictures pointing at the files on the device. The
// full-size originals were not kept, so those point at the kept copy too.
function localise(post: Post, media: Record<string, string>): Post {
	const copy = JSON.parse(JSON.stringify(post)) as Post;
	const local = (u?: string) => (u ? media[u] : undefined);
	const visit = (p: Post) => {
		const preview = local(p.preview?.url);
		if (p.thumbnail) p.thumbnail = local(p.thumbnail) ?? p.thumbnail;
		if (p.image) p.image.url = local(p.image.url) ?? preview ?? p.image.url;
		if (p.previewSource && preview) p.previewSource.url = preview;
		if (p.preview && preview) p.preview.url = preview;
		for (const item of p.gallery ?? []) {
			const file = local(item.url);
			if (file) {
				item.url = file;
				item.fullUrl = file;
			}
		}
		if (p.selftextHtml) {
			for (const t of textImages(p.selftextHtml)) {
				const file = media[t.url];
				if (file) p.selftextHtml = p.selftextHtml.split(t.raw).join(file);
			}
		}
		if (p.crosspost) visit(p.crosspost);
	};
	visit(copy);
	return copy;
}

// Where a folder is, as a URL the WebView can load files from.
async function baseUrl(dir: string): Promise<string> {
	const { uri } = await Filesystem.getUri({ path: dir, directory: DIRECTORY });
	return Capacitor.convertFileSrc(uri);
}

async function download(dir: string, urls: string[], have: Record<string, string>): Promise<Record<string, string>> {
	const media: Record<string, string> = {};
	const todo: string[] = [];
	for (const url of urls) {
		if (have[url]) media[url] = have[url];
		else todo.push(url);
	}
	const next = async (): Promise<void> => {
		const url = todo.shift();
		if (!url) return;
		try {
			const name = nameOf(url);
			const res = await Filesystem.downloadFile({
				url,
				path: `${dir}/${name}`,
				directory: DIRECTORY,
				headers: { Referer: 'https://www.reddit.com' }
			});
			if (res.path) media[url] = name;
		} catch (e) {
			// One missing picture should not cost the whole copy.
			console.warn('offline: picture not kept', url, e);
		}
		return next();
	};
	await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, next));
	return media;
}

const inFlight = new Set<string>();

async function readStored(dir: string): Promise<StoredCopy | null> {
	try {
		const res = await Filesystem.readFile({ path: `${dir}/post.json`, directory: DIRECTORY, encoding: Encoding.UTF8 });
		const copy = JSON.parse(res.data as string) as StoredCopy;
		return copy?.v === 2 && copy.post ? copy : null;
	} catch {
		return null;
	}
}

/**
 * Write (or refresh) the offline copy of a post. Pass `data` when the post and
 * its comments were just loaded, to avoid fetching them a second time.
 */
export async function storeOffline(id: string, data?: { post: Post; comments: CommentNode[] }): Promise<boolean> {
	if (!browser || !IS_NATIVE || inFlight.has(id) || !collectionOf(id)) return false;
	inFlight.add(id);
	try {
		let fresh = data;
		if (!fresh) {
			const r = await getSubmissionComments(id);
			// A stale cached answer is no better than what may already be kept.
			if (!r.ok || r.meta?.staleAt) return false;
			fresh = r.data;
		}
		// Unsaved, or moved between folders, while this was in progress: write
		// to wherever it belongs now.
		const collection = collectionOf(id);
		if (!collection) return false;
		const dir = `${ROOTS[collection]}/${id}`;

		await Filesystem.mkdir({ path: dir, directory: DIRECTORY, recursive: true }).catch(() => undefined);
		const previous = await readStored(dir);
		const media = await download(dir, picturesOf(fresh.post), previous?.media ?? {});
		const copy: StoredCopy = {
			v: 2,
			at: Date.now(),
			// A plain copy: this may be the reactive object the page is showing.
			post: JSON.parse(JSON.stringify(fresh.post)) as Post,
			comments: fresh.comments,
			media
		};
		await Filesystem.writeFile({
			path: `${dir}/post.json`,
			directory: DIRECTORY,
			encoding: Encoding.UTF8,
			data: JSON.stringify(copy)
		});
		if (collectionOf(id) !== collection) {
			// It moved or was removed during the write. Not ours to keep here.
			if (!collectionOf(id)) await removeOffline(id, collection);
			return false;
		}
		mark(id, true);
		// The list it is in should show its thumbnail without a connection too.
		const thumbName = media[fresh.post.thumbnail ?? ''] ?? media[fresh.post.preview?.url ?? ''];
		if (thumbName) {
			const thumbnail = `${await baseUrl(dir)}/${thumbName}`;
			if (collection === 'private') privatePosts.enrich(id, { thumbnail });
			else saved.enrich(id, { thumbnail });
		}
		return true;
	} catch (e) {
		console.error('offline: could not keep post', id, e);
		return false;
	} finally {
		inFlight.delete(id);
	}
}

export async function readOffline(id: string): Promise<OfflineCopy | null> {
	if (!browser || !IS_NATIVE) return null;
	const collection = collectionOf(id);
	if (!collection) return null;
	const dir = `${ROOTS[collection]}/${id}`;
	const stored = await readStored(dir);
	if (!stored || stored.post.id !== id) return null;
	try {
		const base = await baseUrl(dir);
		const urls: Record<string, string> = {};
		for (const [remote, name] of Object.entries(stored.media)) urls[remote] = `${base}/${name}`;
		return { at: stored.at, post: localise(stored.post, urls), comments: stored.comments };
	} catch {
		return null;
	}
}

export async function removeOffline(id: string, collection: Collection): Promise<void> {
	if (!browser || !IS_NATIVE) return;
	await Filesystem.rmdir({ path: `${ROOTS[collection]}/${id}`, directory: DIRECTORY, recursive: true }).catch(() => undefined);
	// Still listed in the other folder means the copy went there, not away.
	if (!collectionOf(id)) mark(id, false);
}

/**
 * Move a post between the Saved list and the private folder, taking its
 * offline copy along. The post is added to its new list before it leaves the
 * old one, so nothing watching the lists ever sees it as unsaved.
 */
export async function movePost(id: string, to: Collection): Promise<void> {
	const from: Collection = to === 'private' ? 'saved' : 'private';
	const entry = (to === 'private' ? get(saved) : get(privatePosts)).get(id);
	if (!entry) return;
	const { id: _id, savedAt, ...meta } = entry;
	// A thumbnail pointing into the old folder would be a dead link.
	if (meta.thumbnail?.includes('_capacitor_file_')) {
		meta.thumbnail = meta.thumbnail.replace(`/${ROOTS[from]}/${id}/`, `/${ROOTS[to]}/${id}/`);
	}
	if (to === 'private') privatePosts.add(id, meta, savedAt);
	else saved.save(id, meta);
	if (browser && IS_NATIVE) {
		await Filesystem.mkdir({ path: ROOTS[to], directory: DIRECTORY, recursive: true }).catch(() => undefined);
		await Filesystem.rename({
			from: `${ROOTS[from]}/${id}`,
			to: `${ROOTS[to]}/${id}`,
			directory: DIRECTORY,
			toDirectory: DIRECTORY
		}).catch(() => undefined);
	}
	if (to === 'private') saved.unsave(id);
	else privatePosts.remove(id);
}

// ---- keeping copies in step with the two lists ----

const queue: string[] = [];
let draining = false;
async function drain() {
	if (draining) return;
	draining = true;
	try {
		while (queue.length > 0) {
			const id = queue.shift() as string;
			if (collectionOf(id) && !get(offlineIds).has(id)) {
				await storeOffline(id);
				await new Promise((r) => setTimeout(r, QUEUE_GAP_MS));
			}
		}
	} finally {
		draining = false;
	}
}

// Follow one list from now on: copy what is added, drop the copy of what is
// removed. Posts already in the list at this point are not copied in bulk
// (that would be a request per post at every launch for anyone with a long
// list); they get a copy the next time they are opened.
function follow(collection: Collection, store: { subscribe: typeof saved.subscribe }): void {
	let known = new Set(get(store).keys());
	store.subscribe((m) => {
		for (const id of m.keys()) {
			if (!known.has(id)) queue.push(id);
		}
		for (const id of known) {
			if (!m.has(id)) void removeOffline(id, collection);
		}
		known = new Set(m.keys());
		if (queue.length > 0) void drain();
	});
}

async function init() {
	if (!browser || !IS_NATIVE) return;
	await Promise.all([savedReady, privateReady]);
	// Which copies exist is simply which folders exist.
	const ids = new Set<string>();
	for (const collection of ['saved', 'private'] as const) {
		try {
			const listing = await Filesystem.readdir({ path: ROOTS[collection], directory: DIRECTORY });
			for (const f of listing.files) {
				if (f.type !== 'directory') continue;
				// A copy whose post is no longer in that list is left over from a
				// removal that did not finish (the app was closed first).
				if (collectionOf(f.name) === collection) ids.add(f.name);
				else void Filesystem.rmdir({ path: `${ROOTS[collection]}/${f.name}`, directory: DIRECTORY, recursive: true }).catch(() => undefined);
			}
		} catch {
			// No folder yet: nothing has been kept there.
		}
	}
	offlineIds.set(ids);
	follow('saved', saved);
	follow('private', privatePosts);
}

export const offlineReady = init();
