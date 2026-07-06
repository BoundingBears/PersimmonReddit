// Svelte action that adds pinch-to-zoom + drag-to-pan + double-tap-to-zoom
// to an `<img>` element. Built from scratch with PointerEvents because the
// WebView's native `touch-action: pinch-zoom` is unreliable on Capacitor /
// Android.
//
// Usage:
//   <img use:pinchZoom={{ minScale: 1, maxScale: 4 }} … />
//
// The action sets `node.style.transform` directly. Caller should NOT also set
// transform via CSS or it'll fight us. Caller MUST set `touch-action: none`
// on the node so the browser doesn't try to handle gestures itself.

export interface PinchZoomOptions {
	minScale?: number;
	maxScale?: number;
	doubleTapScale?: number;
	doubleTapMs?: number;
	// Gallery / dismiss gestures, only active while NOT zoomed in (scale ===
	// minScale). Left undefined for viewers that don't want them.
	onSwipeNext?: () => void;
	onSwipePrev?: () => void;
	onDismiss?: () => void;
	// Live vertical drag distance during a dismiss gesture (px, 0 on release/
	// cancel) so the host can fade the backdrop as the image is dragged away.
	onDragProgress?: (dy: number) => void;
}

const DEFAULTS = {
	minScale: 1,
	maxScale: 4,
	doubleTapScale: 2.5,
	doubleTapMs: 300
};

// Movement (px) before a one-finger drag commits to an axis.
const SWIPE_SLOP = 10;
// Fraction of viewport width a horizontal swipe must cross to page images.
const SWIPE_COMMIT_FRACTION = 0.25;
// Vertical drop (px) that commits to dismiss.
const DISMISS_COMMIT_PX = 120;
// px/ms flick velocity that commits regardless of distance.
const FLICK_VELOCITY = 0.5;

interface Point {
	x: number;
	y: number;
}

function distance(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

export function pinchZoom(node: HTMLElement, options: PinchZoomOptions = {}) {
	let opts = { ...DEFAULTS, ...options };

	const pointers = new Map<number, Point>();
	let scale = 1;
	let tx = 0;
	let ty = 0;

	let initialPinch: { distance: number; scale: number; midX: number; midY: number } | null = null;
	let panStart: { x: number; y: number; tx: number; ty: number } | null = null;
	let lastTap: { time: number; x: number; y: number } | null = null;
	// One-finger drag started at scale===minScale: horizontal pages between
	// images, vertical dismisses. Axis locks once movement passes the slop.
	let swipe: { x: number; y: number; time: number; axis: 'none' | 'x' | 'y' } | null = null;

	function apply() {
		node.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
	}

	// Animate tx/ty back to rest (used when a swipe/dismiss doesn't commit) and
	// clear the backdrop fade. The transition is removed once it finishes so it
	// never interferes with pinch/pan, which need instant transform updates.
	function settleBack() {
		node.style.transition = 'transform 180ms ease-out';
		tx = 0;
		ty = 0;
		apply();
		opts.onDragProgress?.(0);
		const clear = () => {
			node.style.transition = '';
			node.removeEventListener('transitionend', clear);
		};
		node.addEventListener('transitionend', clear);
	}

	function reset() {
		scale = 1;
		tx = 0;
		ty = 0;
		initialPinch = null;
		panStart = null;
		lastTap = null;
		swipe = null;
		node.style.transition = '';
		pointers.clear();
		opts.onDragProgress?.(0);
		apply();
	}

	function clamp(v: number, lo: number, hi: number) {
		return Math.max(lo, Math.min(hi, v));
	}

	// Keep tx/ty within bounds so the image edges never expose the empty
	// parent area, and snap back to centered when the user zooms all the
	// way out. Called after every pinch/pan update.
	function clampPan() {
		const parent = node.parentElement;
		if (!parent) return;
		const imgW = node.offsetWidth * scale;
		const imgH = node.offsetHeight * scale;
		const parW = parent.clientWidth;
		const parH = parent.clientHeight;
		if (imgW > parW) {
			const maxTx = (imgW - parW) / 2;
			tx = clamp(tx, -maxTx, maxTx);
		} else {
			tx = 0;
		}
		if (imgH > parH) {
			const maxTy = (imgH - parH) / 2;
			ty = clamp(ty, -maxTy, maxTy);
		} else {
			ty = 0;
		}
	}

	function down(e: PointerEvent) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		// Never let a settle-back animation bleed into a fresh gesture.
		node.style.transition = '';

		if (pointers.size === 2) {
			// Two-finger pinch starts. A pinch always wins over an in-progress
			// swipe, so abandon it and reset any swipe offset instantly (no
			// transition — pinch needs immediate transform updates).
			if (swipe && swipe.axis !== 'none') {
				tx = 0;
				ty = 0;
				opts.onDragProgress?.(0);
				apply();
			}
			swipe = null;
			const [a, b] = [...pointers.values()];
			initialPinch = {
				distance: distance(a, b),
				scale,
				midX: (a.x + b.x) / 2,
				midY: (a.y + b.y) / 2
			};
			panStart = null; // pan can't run alongside pinch
		} else if (pointers.size === 1 && scale > opts.minScale) {
			// Single-finger drag-to-pan, only when zoomed in
			panStart = { x: e.clientX, y: e.clientY, tx, ty };
			try {
				node.setPointerCapture(e.pointerId);
			} catch {
				// some pointer types don't support capture; ignore
			}
		} else if (pointers.size === 1) {
			// Not zoomed: candidate for a page-swipe or swipe-to-dismiss.
			swipe = { x: e.clientX, y: e.clientY, time: Date.now(), axis: 'none' };
		}
	}

	function move(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size === 2 && initialPinch) {
			const [a, b] = [...pointers.values()];
			const newDist = distance(a, b);
			const ratio = newDist / initialPinch.distance;
			scale = clamp(initialPinch.scale * ratio, opts.minScale, opts.maxScale);

			// Keep the pinch midpoint anchored on screen by translating the
			// element by the change in midpoint position.
			const newMidX = (a.x + b.x) / 2;
			const newMidY = (a.y + b.y) / 2;
			tx += newMidX - initialPinch.midX;
			ty += newMidY - initialPinch.midY;
			initialPinch.midX = newMidX;
			initialPinch.midY = newMidY;

			clampPan();
			e.preventDefault();
			apply();
		} else if (pointers.size === 1 && panStart && scale > opts.minScale) {
			tx = panStart.tx + (e.clientX - panStart.x);
			ty = panStart.ty + (e.clientY - panStart.y);
			clampPan();
			e.preventDefault();
			apply();
		} else if (pointers.size === 1 && swipe) {
			const dx = e.clientX - swipe.x;
			const dy = e.clientY - swipe.y;
			if (swipe.axis === 'none') {
				if (Math.abs(dx) > SWIPE_SLOP || Math.abs(dy) > SWIPE_SLOP) {
					swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
					panMoved = true; // a drag isn't a tap; don't arm double-tap
				} else {
					return; // below slop: still ambiguous, wait
				}
			}
			if (swipe.axis === 'x') {
				tx = dx;
				ty = 0;
			} else {
				// Vertical drag dismisses in either direction (up or down); the
				// backdrop fades by the absolute distance travelled.
				ty = dy;
				tx = 0;
				opts.onDragProgress?.(Math.abs(dy));
			}
			e.preventDefault();
			apply();
		}
	}

	function up(e: PointerEvent) {
		const pt = pointers.get(e.pointerId);
		pointers.delete(e.pointerId);
		try {
			if (node.hasPointerCapture(e.pointerId)) {
				node.releasePointerCapture(e.pointerId);
			}
		} catch {
			// ignore
		}

		if (pointers.size < 2) initialPinch = null;
		if (pointers.size === 0) panStart = null;

		// Resolve a one-finger swipe/dismiss on release.
		if (pointers.size === 0 && swipe) {
			const s = swipe;
			swipe = null;
			if (s.axis !== 'none' && pt) {
				const dx = pt.x - s.x;
				const dy = pt.y - s.y;
				const dt = Math.max(Date.now() - s.time, 1);
				if (s.axis === 'x') {
					const vw = node.parentElement?.clientWidth || node.offsetWidth || 1;
					const commit = Math.abs(dx) > vw * SWIPE_COMMIT_FRACTION || Math.abs(dx) / dt > FLICK_VELOCITY;
					if (commit) {
						if (dx < 0) opts.onSwipeNext?.();
						else opts.onSwipePrev?.();
					}
					// If the index changed the host swaps src and the MutationObserver
					// recenters; otherwise (edge / single image) animate the drag back.
					settleBack();
				} else {
					// Dismiss on a far-enough or fast-enough drag in either direction.
					const absDy = Math.abs(dy);
					const commit = absDy > DISMISS_COMMIT_PX || (absDy / dt > FLICK_VELOCITY && absDy > SWIPE_SLOP);
					if (commit) opts.onDismiss?.();
					else settleBack();
				}
				panMoved = false;
				return;
			}
		}

		// Double-tap detection: only when no pinch was happening and the last
		// pointerup happened recently and close to this one.
		if (pointers.size === 0 && pt && !panMoved) {
			const now = Date.now();
			if (
				lastTap &&
				now - lastTap.time < opts.doubleTapMs &&
				distance(pt, lastTap) < 30
			) {
				// Double-tap: toggle between minScale and doubleTapScale,
				// anchored at the tap position so the spot you tapped stays
				// roughly under your finger.
				if (scale > opts.minScale) {
					scale = opts.minScale;
					tx = 0;
					ty = 0;
				} else {
					scale = opts.doubleTapScale;
					const rect = node.getBoundingClientRect();
					const cx = rect.left + rect.width / 2;
					const cy = rect.top + rect.height / 2;
					tx = (cx - pt.x) * (scale - 1);
					ty = (cy - pt.y) * (scale - 1);
					clampPan();
				}
				apply();
				lastTap = null;
			} else {
				lastTap = { time: now, x: pt.x, y: pt.y };
			}
		}
		panMoved = false;
	}

	let panMoved = false;
	function moveDirty(e: PointerEvent) {
		if (panStart && pointers.size === 1) {
			const dx = e.clientX - panStart.x;
			const dy = e.clientY - panStart.y;
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) panMoved = true;
		}
		move(e);
	}

	function cancel(e: PointerEvent) {
		pointers.delete(e.pointerId);
		try {
			if (node.hasPointerCapture(e.pointerId)) {
				node.releasePointerCapture(e.pointerId);
			}
		} catch {
			// ignore
		}
		if (pointers.size < 2) initialPinch = null;
		if (pointers.size === 0) panStart = null;
		if (pointers.size === 0 && swipe) {
			const hadDrag = swipe.axis !== 'none';
			swipe = null;
			if (hadDrag) settleBack();
		}
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', moveDirty);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);

	// Reset whenever the element's `src` changes (e.g. user swiped to a
	// different gallery item or opened a new image).
	const srcObserver = new MutationObserver(reset);
	if (node.tagName === 'IMG') {
		srcObserver.observe(node, { attributes: true, attributeFilter: ['src'] });
	}

	return {
		update(next: PinchZoomOptions) {
			opts = { ...DEFAULTS, ...next };
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', moveDirty);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			srcObserver.disconnect();
		}
	};
}
