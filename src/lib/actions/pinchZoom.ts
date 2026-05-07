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
}

const DEFAULTS = {
	minScale: 1,
	maxScale: 4,
	doubleTapScale: 2.5,
	doubleTapMs: 300
};

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

	function apply() {
		node.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
	}

	function reset() {
		scale = 1;
		tx = 0;
		ty = 0;
		initialPinch = null;
		panStart = null;
		lastTap = null;
		pointers.clear();
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

		if (pointers.size === 2) {
			// Two-finger pinch starts
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
