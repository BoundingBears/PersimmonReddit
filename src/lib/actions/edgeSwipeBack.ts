// iOS-only edge-swipe-back gesture with thumb-tracking AND a real preview
// of the previous page sliding in from the left, parallax-style.
//
// How the preview works: SPAs only mount one route at a time, so the
// "previous page" stops existing the moment SvelteKit navigates. To get
// around this we capture a lightweight HTML snapshot of `<main class="main">`
// before every navigation (see pageSnapshot.ts + the beforeNavigate hook in
// +layout.svelte). When the swipe-back gesture starts we re-render that
// snapshot as a static, fixed-position layer behind .app. Browsers re-use
// cached image / font / CSS resources, so it's near-instantaneous and
// visually indistinguishable from the real previous page during a 220ms
// gesture animation.
//
// On commit we let our own CSS transition finish the slide-off (continuous
// with the user's drag motion), then call history.back() with a marker
// dataset that tells +layout.svelte's onNavigate to skip View Transitions
// (we already animated, no redundant slide). Cleanup happens in the
// layout's afterNavigate via consumeEdgeSwipeBackCleanup().
//
// Android handles back via Capacitor App.backButton (see installBackHandler.ts);
// browsers have their own back button. So this no-ops on both.

import { get } from 'svelte/store';
import { isIOS } from '$lib/utils/iosOverlay';
import { drawerOpen } from '$lib/stores/drawer';
import { postActionsState } from '$lib/stores/postActions';
import { viewerState } from '$lib/stores/imageViewer';
import { getPageSnapshot, type PageSnapshot } from '$lib/utils/pageSnapshot';

export interface EdgeSwipeBackOptions {
	edgePx?: number;
	commitPx?: number;
	maxVerticalPx?: number;
}

const DEFAULTS: Required<EdgeSwipeBackOptions> = {
	edgePx: 30,
	commitPx: 80,
	maxVerticalPx: 60
};

// The peek layer is stationary at translateX(0) from drag start. As the
// current page slides off to the right, the peek is revealed underneath —
// no parallax. (iOS native does subtle parallax; we tested and a static
// peek reads cleaner here.)
const PEEK_DIM_MAX = 0.4; // dim opacity at drag start, fades to 0 on commit
const ANIMATION_MS = 220;
const ANIMATION_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function anyOverlayOpen(): boolean {
	return get(drawerOpen) || get(postActionsState) !== null || get(viewerState) !== null;
}

// Cleanup is deferred to +layout.svelte's afterNavigate so the peek layer
// stays visible until SvelteKit has actually mounted the new route — the
// real DOM and the peek snapshot show the same content, so swapping them
// is invisible to the user.
let pendingCleanup: (() => void) | null = null;

export function consumeEdgeSwipeBackCleanup(): void {
	pendingCleanup?.();
	pendingCleanup = null;
}

interface PeekHandles {
	layer: HTMLDivElement;
	dim: HTMLDivElement;
}

function buildPeek(snap: PageSnapshot): PeekHandles {
	const layer = document.createElement('div');
	layer.className = 'edge-swipe-peek';
	Object.assign(layer.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		right: '0',
		bottom: '0',
		zIndex: '0',
		background: snap.bgColor || '#000',
		overflow: 'hidden',
		pointerEvents: 'none'
		// No transform — peek is stationary; the slide-out of .app reveals it.
	} as Partial<CSSStyleDeclaration>);
	const inner = document.createElement('div');
	inner.innerHTML = snap.html;
	layer.appendChild(inner);

	const dim = document.createElement('div');
	Object.assign(dim.style, {
		position: 'absolute',
		top: '0',
		left: '0',
		right: '0',
		bottom: '0',
		background: '#000',
		opacity: String(PEEK_DIM_MAX),
		pointerEvents: 'none'
	} as Partial<CSSStyleDeclaration>);
	layer.appendChild(dim);

	document.body.appendChild(layer);
	return { layer, dim };
}

export function edgeSwipeBack(node: HTMLElement, options: EdgeSwipeBackOptions = {}) {
	if (!isIOS()) return;

	let opts = { ...DEFAULTS, ...options };
	let startX = 0;
	let startY = 0;
	let active = false;
	let dragging = false;
	let visualTrack = false;
	let peek: PeekHandles | null = null;
	let saved = {
		zIndex: '',
		position: '',
		transition: '',
		transform: '',
		boxShadow: '',
		background: ''
	};

	function snapshotAppStyle() {
		saved = {
			zIndex: node.style.zIndex,
			position: node.style.position,
			transition: node.style.transition,
			transform: node.style.transform,
			boxShadow: node.style.boxShadow,
			background: node.style.background
		};
	}

	function restoreAppStyle() {
		node.style.zIndex = saved.zIndex;
		node.style.position = saved.position;
		node.style.transition = saved.transition;
		node.style.transform = saved.transform;
		node.style.boxShadow = saved.boxShadow;
		node.style.background = saved.background;
	}

	function startVisual() {
		snapshotAppStyle();
		// Elevate .app above the peek layer's z-index 0.
		node.style.position = node.style.position || 'relative';
		node.style.zIndex = '1';
		node.style.transition = 'none';

		// .app itself has no background — the apparent page color comes from
		// <body>. With peek now painted between body and .app, transparent
		// regions of .app (tabs nav, profile header, empty list area) would
		// let the peek bleed through, making the swiping page look ghosted.
		// Paint .app with body's bg so it slides as one opaque block.
		try {
			const bg = getComputedStyle(document.body).backgroundColor;
			if (bg) node.style.background = bg;
		} catch {
			// ignore
		}

		const snap = getPageSnapshot();
		if (snap) {
			peek = buildPeek(snap);
		}
		// Even without a snapshot, we still translate .app for thumb-tracking
		// — just no peek layer behind.
		visualTrack = true;
	}

	function setVisuals(dx: number) {
		const w = window.innerWidth;
		const progress = Math.min(1, Math.max(0, dx / w));
		node.style.transform = dx === 0 ? '' : `translateX(${dx}px)`;
		node.style.boxShadow = dx === 0 ? '' : '-8px 0 24px rgba(0, 0, 0, 0.25)';
		if (peek) {
			// Peek itself stays put; only its dim overlay fades as the user
			// reveals more of it.
			peek.dim.style.opacity = String(PEEK_DIM_MAX * (1 - progress));
		}
	}

	function endVisualImmediate() {
		// Hard reset, no animation. Used when bailing out before any drag
		// commit happened (e.g., user touched the edge then scrolled vertically).
		peek?.layer.remove();
		peek = null;
		restoreAppStyle();
		visualTrack = false;
	}

	function commit(_finalDx: number) {
		if (!visualTrack) {
			// No visual was set up (overlay was open) — just fire back.
			history.back();
			return;
		}

		const w = window.innerWidth;

		// Continue the slide: .app finishes off-screen right. Peek stays put;
		// only its dim fades to 0 so the revealed page reads as "now in front."
		node.style.transition = `transform ${ANIMATION_MS}ms ${ANIMATION_EASE}`;
		node.style.transform = `translateX(${w}px)`;
		if (peek) {
			peek.dim.style.transition = `opacity ${ANIMATION_MS}ms ${ANIMATION_EASE}`;
			peek.dim.style.opacity = '0';
		}

		const onTransitionEnd = (ev: TransitionEvent) => {
			if (ev.target !== node || ev.propertyName !== 'transform') return;
			node.removeEventListener('transitionend', onTransitionEnd);

			// Tell the layout's onNavigate to skip View Transitions for this
			// nav (we already animated). The afterNavigate hook calls our
			// cleanup callback — that's where we reset .app and remove peek.
			document.documentElement.dataset.edgeSwipeBackPending = 'true';
			pendingCleanup = () => {
				// At this point SvelteKit has rendered the new route into .app.
				// .app is still at translateX(100%); the peek (snapshot) is
				// visible. We need to swap them seamlessly:
				//   1. Reset .app's transform instantly while it's still
				//      z-index-elevated above the peek. The real new DOM now
				//      sits exactly on top of the peek snapshot.
				//   2. Remove peek BEFORE restoring .app's z-index — otherwise
				//      DOM-order-based stacking briefly puts peek on top of
				//      a non-elevated .app and you see the snapshot for one
				//      frame instead of the real (potentially differently
				//      scrolled / lazily-loaded) DOM. That was the "flash"
				//      between the swiped page and the real new page.
				//   3. Then restore .app's other styles.
				const peekRef = peek;
				const savedRef = { ...saved };
				node.style.transition = 'none';
				node.style.transform = '';
				node.style.boxShadow = '';
				void node.offsetHeight; // synchronous reflow so the reset takes hold

				peekRef?.layer.remove();
				peek = null;

				node.style.transition = savedRef.transition;
				node.style.zIndex = savedRef.zIndex;
				node.style.position = savedRef.position;
				node.style.background = savedRef.background;
				visualTrack = false;
				delete document.documentElement.dataset.edgeSwipeBackPending;
			};

			history.back();
		};
		node.addEventListener('transitionend', onTransitionEnd);
	}

	function cancel() {
		if (!visualTrack) {
			node.style.transition = `transform ${ANIMATION_MS}ms ${ANIMATION_EASE}`;
			node.style.transform = '';
			node.style.boxShadow = '';
			return;
		}

		// Animate everything back to the resting state.
		node.style.transition = `transform ${ANIMATION_MS}ms ${ANIMATION_EASE}`;
		node.style.transform = '';
		node.style.boxShadow = '';
		if (peek) {
			// Peek didn't move; just fade dim back to its starting opacity.
			peek.dim.style.transition = `opacity ${ANIMATION_MS}ms ${ANIMATION_EASE}`;
			peek.dim.style.opacity = String(PEEK_DIM_MAX);
		}

		const onEnd = (ev: TransitionEvent) => {
			if (ev.target !== node || ev.propertyName !== 'transform') return;
			node.removeEventListener('transitionend', onEnd);
			peek?.layer.remove();
			peek = null;
			restoreAppStyle();
			visualTrack = false;
		};
		node.addEventListener('transitionend', onEnd);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const t = e.touches[0];
		if (t.clientX > opts.edgePx) return;
		startX = t.clientX;
		startY = t.clientY;
		active = true;
		dragging = false;
		visualTrack = false;
		if (!anyOverlayOpen()) startVisual();
	}

	function onTouchMove(e: TouchEvent) {
		if (!active) return;
		const t = e.touches[0];
		const dx = t.clientX - startX;
		const dy = t.clientY - startY;

		if (!dragging) {
			if (Math.abs(dy) > opts.maxVerticalPx) {
				active = false;
				if (visualTrack) endVisualImmediate();
				return;
			}
			if (dx < 8) return;
			dragging = true;
		}

		if (!visualTrack) return;
		if (e.cancelable) e.preventDefault();
		setVisuals(Math.max(0, dx));
	}

	function onTouchEnd(e: TouchEvent) {
		if (!active) return;
		active = false;
		const t = e.changedTouches[0];
		if (!t) {
			cancel();
			dragging = false;
			return;
		}
		const dx = t.clientX - startX;
		if (dragging && dx > opts.commitPx) {
			commit(dx);
		} else {
			cancel();
		}
		dragging = false;
	}

	function onTouchCancel() {
		if (!active) return;
		active = false;
		cancel();
		dragging = false;
	}

	node.addEventListener('touchstart', onTouchStart, { passive: true });
	node.addEventListener('touchmove', onTouchMove, { passive: false });
	node.addEventListener('touchend', onTouchEnd);
	node.addEventListener('touchcancel', onTouchCancel);

	return {
		update(next: EdgeSwipeBackOptions) {
			opts = { ...DEFAULTS, ...next };
		},
		destroy() {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('touchend', onTouchEnd);
			node.removeEventListener('touchcancel', onTouchCancel);
			peek?.layer.remove();
			peek = null;
		}
	};
}
