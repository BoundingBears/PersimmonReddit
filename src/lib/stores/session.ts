// Survive the app being killed while the user is in the middle of something.
//
// Android routinely reclaims a backgrounded or screen-off app: the WebView's
// renderer goes first, and the whole process often follows. Everything that
// lived only in JS memory went with it, so coming back meant a cold start on a
// freshly fetched front page: the place in the feed gone, the post being read
// gone, and "back" leading somewhere the user had never been.
//
// This module writes a small record of where the user is (the back stack, the
// feeds behind it, and the scroll anchor in each) to localStorage, and offers
// it back on the next launch if it is recent enough to still be "the same
// visit". The rest of the app only sees its normal in-memory structures being
// pre-filled: feedSnapshot.ts seeds its map from here, and +layout.svelte
// replays the stack.
//
// localStorage rather than Capacitor Preferences because the read has to be
// synchronous: a feed page looks its snapshot up while its component is being
// constructed, before anything async could resolve.

import { browser } from '$app/environment';
import { activeScrollTop } from '$lib/utils/scroller';
import type { FeedSnapshot } from './feedSnapshot';

const STORAGE_KEY = 'persimmon.session';

// How long a saved session still counts as the same visit. Past this the user
// most likely wants fresh posts more than their old place.
const TTL_MS = 2 * 60 * 60 * 1000;
// A session is only worth restoring if there is a place to lose: the user had
// navigated somewhere, or had scrolled this far into the root feed. Sitting at
// the top of the front page should get fresh posts, not an old copy.
const MIN_SCROLL_WORTH_RESTORING = 600;
const MAX_FEEDS = 3;
// Posts kept above the scroll anchor. The anchor-based restore does not need
// the whole run, and a deep session can hold hundreds of posts.
const KEEP_ABOVE_ANCHOR = 40;
const MAX_BYTES = 3_500_000;
const SCROLL_IDLE_MS = 1500;
// How much of the back stack is rebuilt after a restart, beyond the root.
// Every rebuilt entry is a page that mounts and may start loading, so a long
// browsing session must not replay in full: 28 entries meant 28 pages walked
// one after another. What matters is where the user was, where "back" leads
// from there, and the root underneath so further backs end up at home.
const REPLAY_TAIL = 2;
const STORED_TAIL = 4;

/** The root plus the last `tail` entries, without consecutive repeats. */
export function compressStack(stack: string[], tail: number): string[] {
	const deduped = stack.filter((url, i) => i === 0 || url !== stack[i - 1]);
	if (deduped.length <= tail + 1) return deduped;
	const out = [deduped[0], ...deduped.slice(-tail)];
	return out.filter((url, i) => i === 0 || url !== out[i - 1]);
}

interface Persisted {
	// Post shapes can change between builds; never feed an old build's data to
	// a new one.
	v: string;
	savedAt: number;
	// Back stack, oldest first. The last entry is where the user was.
	stack: string[];
	// Scroll offset of the top page, for pages that are not feeds (a post).
	topScrollY: number;
	feeds: Array<[string, FeedSnapshot]>;
}

function read(): Persisted | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as Persisted;
		if (!p || p.v !== __APP_VERSION__ || !Array.isArray(p.stack) || p.stack.length === 0) return null;
		if (typeof p.savedAt !== 'number' || Date.now() - p.savedAt > TTL_MS || Date.now() < p.savedAt) return null;
		if (!Array.isArray(p.feeds)) p.feeds = [];
		return p;
	} catch {
		return null;
	}
}

function worthRestoring(p: Persisted): boolean {
	if (p.stack.length > 1) return true;
	if ((p.topScrollY ?? 0) >= MIN_SCROLL_WORTH_RESTORING) return true;
	return p.feeds.some(([, f]) => (f.scrollY ?? 0) >= MIN_SCROLL_WORTH_RESTORING);
}

// A restore belongs to a normal launch, which always starts at the root. If
// the page was opened somewhere specific (a reload on that page, a typed URL
// in the dev server), the user asked for that page: leave them on it, unless
// it is simply where the saved session already was.
function bootedWhereExpected(p: Persisted): boolean {
	if (!browser) return false;
	const here = location.pathname + location.search;
	return here === '/' || here === p.stack[p.stack.length - 1];
}

// Read once, at import, so the answer is ready before the first page builds.
const loaded = read();
const restorable = loaded && worthRestoring(loaded) && bootedWhereExpected(loaded) ? loaded : null;
if (browser && loaded && !restorable) {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

let pendingStack: string[] | null = restorable ? compressStack(restorable.stack, REPLAY_TAIL) : null;
let pendingTop: { path: string; y: number } | null =
	restorable && restorable.topScrollY > 0
		? { path: restorable.stack[restorable.stack.length - 1], y: restorable.topScrollY }
		: null;

/** Feed snapshots from the previous run, for feedSnapshot.ts to seed itself with. */
export function restoredFeeds(): Array<[string, FeedSnapshot]> {
	return restorable ? restorable.feeds : [];
}

/** The back stack to rebuild, once. Null when there is nothing to restore. */
export function takeRestoredStack(): string[] | null {
	const s = pendingStack;
	pendingStack = null;
	return s;
}

/** Drop a pending restore, e.g. because the app was launched from a link. */
export function cancelRestore(): void {
	pendingStack = null;
	pendingTop = null;
}

/** Scroll offset to return to on a non-feed page (a post). */
export function peekRestoredScroll(path: string): number | null {
	return pendingTop && pendingTop.path === path ? pendingTop.y : null;
}

/** Call once the offset from peekRestoredScroll has actually been applied. */
export function consumeRestoredScroll(): void {
	pendingTop = null;
}

// ---- replay state (read by the layout to suppress page transitions) ----

let replaying = false;
export function isReplaying(): boolean {
	return replaying;
}
export function setReplaying(v: boolean): void {
	replaying = v;
}

// ---- tracking the live session ----

// SvelteKit stamps every history entry with a monotonically increasing index.
// Keying on it gives an exact mirror of the back stack through pushes, pops
// and replaceState without having to infer which of those just happened.
const HISTORY_INDEX = 'sveltekit:history';
const entries = new Map<number, string>();
let currentIdx: number | null = null;

function currentStack(): string[] {
	if (currentIdx === null) return [];
	const top = currentIdx;
	return [...entries.entries()]
		.filter(([k]) => k <= top)
		.sort((a, b) => a[0] - b[0])
		.map(([, url]) => url);
}

/**
 * Is there an in-app page to go back to?
 *
 * The native WebView's canGoBack() is not a safe answer: Chrome marks history
 * entries that were added without a user gesture as skippable, and the stack
 * replayed after a restart is exactly that. canGoBack() then says false, and
 * "back" from a restored post closed the app instead of returning to the feed.
 * history.back() itself is not subject to that skipping, so we only need to
 * know the depth, which we track ourselves.
 */
export function hasBackStack(): boolean {
	return currentStack().length > 1;
}

let feedsProvider: (() => Array<[string, FeedSnapshot]>) | null = null;
/** feedSnapshot.ts hands over its entries, most recently used last. */
export function setFeedsProvider(fn: () => Array<[string, FeedSnapshot]>): void {
	feedsProvider = fn;
}

let isPrivateUrl: ((url: string) => boolean) | null = null;
/**
 * Which pages must not be reopened by a restore. A private post that the app
 * walked back into on its own after a restart would be a way straight past
 * the lock on the private folder.
 */
export function setPrivateUrlCheck(fn: (url: string) => boolean): void {
	isPrivateUrl = fn;
}

let liveSaver: (() => void) | null = null;
/**
 * The mounted feed page registers a function that writes its current posts
 * and scroll anchor into its snapshot, so the feed on screen is captured too
 * (not only feeds the user has navigated away from). Returns an unregister.
 */
export function registerLiveSaver(fn: () => void): () => void {
	liveSaver = fn;
	return () => {
		if (liveSaver === fn) liveSaver = null;
	};
}

// A save runs every time scrolling pauses, and turning a feed's posts into
// JSON is nearly all of what it costs (measured on the emulator: about 60 ms
// of blocked main thread per save, right when the user is about to scroll
// again). The posts only change when a page loads, so their JSON is kept and
// reused; a save in between rebuilds just the few small fields around it.
const TRIM_STEP = 20;
const postsJson = new Map<string, { posts: FeedSnapshot['posts']; from: number; json: string }>();

function feedJson(key: string, snap: FeedSnapshot): string {
	// Posts well above the scroll anchor are dropped: that invalidates the raw
	// pixel offset but not the anchor, which is what the restore aligns on.
	// Dropped in steps, so that scrolling past a few posts does not move the
	// cut (and throw away the cached JSON) on every save.
	let from = 0;
	if (snap.anchorId) {
		const i = snap.posts.findIndex((p) => p.id === snap.anchorId);
		if (i > KEEP_ABOVE_ANCHOR) from = Math.floor((i - KEEP_ABOVE_ANCHOR) / TRIM_STEP) * TRIM_STEP;
	}
	let kept = postsJson.get(key);
	if (!kept || kept.posts !== snap.posts || kept.from !== from) {
		kept = { posts: snap.posts, from, json: JSON.stringify(from > 0 ? snap.posts.slice(from) : snap.posts) };
		postsJson.set(key, kept);
	}
	const { posts: _posts, ...rest } = snap;
	const fields = JSON.stringify(rest);
	return fields === '{}' ? `{"posts":${kept.json}}` : `{"posts":${kept.json},${fields.slice(1)}`;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function persistSession(): void {
	if (!browser || replaying) return;
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	try {
		liveSaver?.();
		const full = currentStack();
		// Forget everything from the first private page onward.
		const cut = isPrivateUrl ? full.findIndex(isPrivateUrl) : -1;
		const stack = cut < 0 ? full : full.slice(0, cut);
		if (stack.length === 0) {
			if (full.length > 0) localStorage.removeItem(STORAGE_KEY);
			return;
		}
		const started = performance.now();
		const feeds = (feedsProvider?.() ?? []).slice(-MAX_FEEDS);
		for (const key of [...postsJson.keys()]) {
			if (!feeds.some(([k]) => k === key)) postsJson.delete(key);
		}
		const base: Omit<Persisted, 'feeds'> = {
			v: __APP_VERSION__,
			savedAt: Date.now(),
			stack: compressStack(stack, STORED_TAIL),
			// The scroll offset belongs to the page that was cut off, if one was.
			topScrollY: cut < 0 ? Math.round(activeScrollTop()) : 0
		};
		const head = JSON.stringify(base).slice(0, -1);
		let parts = feeds.map(([k, s]) => `[${JSON.stringify(k)},${feedJson(k, s)}]`);
		const assemble = () => `${head},"feeds":[${parts.join(',')}]}`;
		let json = assemble();
		// Too big: shed the least recently used feeds, then all of them. The
		// stack alone still gets the user back to the page they were on.
		while (json.length > MAX_BYTES && parts.length > 0) {
			parts = parts.slice(1);
			json = assemble();
		}
		const built = performance.now();
		localStorage.setItem(STORAGE_KEY, json);
		// Readable from DevTools: performance.getEntriesByName('persimmon:save').
		performance.measure('persimmon:save', {
			start: started,
			end: performance.now(),
			detail: { buildMs: Math.round(built - started), writeMs: Math.round(performance.now() - built), kb: Math.round(json.length / 1024) }
		});
	} catch {
		// Quota or serialization trouble must never break navigation.
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}
}

function schedulePersist(): void {
	if (timer) clearTimeout(timer);
	timer = setTimeout(persistSession, 500);
}

/** Call from afterNavigate with the destination URL (path + search). */
export function trackNavigation(url: string, type: string): void {
	if (!browser) return;
	const idx = (history.state as Record<string, unknown> | null)?.[HISTORY_INDEX];
	if (typeof idx !== 'number') return;
	// Anything but a history traversal discards the forward entries.
	if (type !== 'popstate') {
		for (const k of [...entries.keys()]) if (k > idx) entries.delete(k);
	}
	entries.set(idx, url);
	currentIdx = idx;
	schedulePersist();
}

/** The user chose to leave (back at the root). Next launch starts fresh. */
export function clearSession(): void {
	if (!browser) return;
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	entries.clear();
	currentIdx = null;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

/** Wire the "about to be backgrounded" save. Returns a cleanup function. */
export function installSessionPersistence(): () => void {
	if (!browser) return () => {};
	// `hidden` is the last moment the page is guaranteed to run before the
	// system may kill it without further notice.
	const onHide = () => {
		if (document.visibilityState === 'hidden') persistSession();
	};
	// A renderer lost while the app is in the foreground gives no `hidden`
	// first, so also save once scrolling has been still for a moment.
	let scrollTimer: ReturnType<typeof setTimeout> | null = null;
	const onScroll = () => {
		if (scrollTimer) clearTimeout(scrollTimer);
		scrollTimer = setTimeout(persistSession, SCROLL_IDLE_MS);
	};
	document.addEventListener('visibilitychange', onHide);
	window.addEventListener('pagehide', persistSession);
	// Capture, so scrolling inside an open post layer counts too: scroll
	// events from an element do not bubble up to the window.
	window.addEventListener('scroll', onScroll, { passive: true, capture: true });
	return () => {
		if (scrollTimer) clearTimeout(scrollTimer);
		document.removeEventListener('visibilitychange', onHide);
		window.removeEventListener('pagehide', persistSession);
		window.removeEventListener('scroll', onScroll, { capture: true });
	};
}
