// Anchor-based scroll restoration for feeds.
//
// Restoring a feed by raw pixel offset is unreliable on this app's pages:
//
//   - A page whose posts arrive asynchronously (merged feeds, search, profiles)
//     is only a few hundred px tall at the moment the scroll is applied, so the
//     browser CLAMPS the requested offset and the user lands near the top. The
//     later growth never un-clamps it. SvelteKit's built-in restore has exactly
//     this problem — it scrolls before `snapshot.restore()` repopulates state.
//   - Even with content present, the page settles at a slightly different height
//     than when we left it: lazy images decode, a "cached posts" banner appears,
//     a post the user just opened is dropped by the hide-read-posts filter. Every
//     one of those shifts the pixel offset onto a different post.
//
// So we record *which post* was at the top of the viewport and how far into it
// the user had scrolled, and then hold that post in place for a short settle
// window after the restore, re-correcting whenever late layout moves it. The
// raw offset is kept only as the fallback for when the anchor post is gone.
//
// The loop gives up immediately if the user starts scrolling — never fight a
// live gesture.

export interface ScrollAnchor {
	scrollY: number;
	// id of the post that was at the top of the viewport, and that post's offset
	// relative to the viewport top (negative once scrolled into it).
	anchorId?: string;
	anchorOffset?: number;
}

const POST_SELECTOR = '[data-post-id]';

// How long to keep correcting after the restore. Long enough to cover lazy
// image decode and a late paint; short enough that it can't be mistaken for
// the page being stuck.
const DEFAULT_SETTLE_MS = 1200;

export function captureScrollAnchor(selector = POST_SELECTOR): ScrollAnchor {
	if (typeof window === 'undefined') return { scrollY: 0 };
	const scrollY = window.scrollY;
	const els = document.querySelectorAll<HTMLElement>(selector);
	for (const el of els) {
		const rect = el.getBoundingClientRect();
		// First post that is still (even partly) on screen — the one the user
		// reads as "where I am".
		if (rect.bottom > 0) {
			return { scrollY, anchorId: el.dataset.postId, anchorOffset: rect.top };
		}
	}
	return { scrollY };
}

/**
 * Scroll back to `target` and hold it there while the page settles.
 * Returns a cancel function — call it from onDestroy.
 */
export function restoreScrollAnchor(
	target: ScrollAnchor,
	options: { selector?: string; settleMs?: number } = {}
): () => void {
	if (typeof window === 'undefined') return () => {};

	const selector = options.selector ?? POST_SELECTOR;
	const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
	const start = performance.now();

	let raf = 0;
	let done = false;

	function stop() {
		if (done) return;
		done = true;
		if (raf) cancelAnimationFrame(raf);
		window.removeEventListener('touchmove', stop);
		window.removeEventListener('wheel', stop);
	}

	function anchorEl(): HTMLElement | null {
		if (!target.anchorId) return null;
		const id =
			typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target.anchorId) : target.anchorId;
		return document.querySelector<HTMLElement>(`${selector}[data-post-id="${id}"]`);
	}

	function step() {
		if (done) return;

		const el = anchorEl();
		const delta =
			el && target.anchorOffset !== undefined
				? el.getBoundingClientRect().top - target.anchorOffset
				: target.scrollY - window.scrollY;

		// Sub-pixel deltas are noise from fractional layout; correcting them
		// would scroll forever.
		if (Math.abs(delta) > 0.5) {
			window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
		}

		if (performance.now() - start > settleMs) {
			stop();
			return;
		}
		raf = requestAnimationFrame(step);
	}

	// Two frames of grace first: SvelteKit applies its own scroll and the View
	// Transition commits the new DOM in between, and correcting on top of a
	// half-laid-out page just wastes the first correction.
	raf = requestAnimationFrame(() => {
		raf = requestAnimationFrame(step);
	});
	window.addEventListener('touchmove', stop, { passive: true });
	window.addEventListener('wheel', stop, { passive: true });

	return stop;
}
