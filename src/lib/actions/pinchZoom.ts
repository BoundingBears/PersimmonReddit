// Gestures for one picture in the fullscreen viewer: pinch to zoom about the
// fingers, drag to pan with a little glide, double-tap to zoom, tap, and a
// vertical drag that pulls the picture away to close the viewer.
//
// The picture lives in a native vertical scroll-snap pager. Moving between
// pictures is left entirely to the browser's scroller, which is why paging
// tracks the finger and keeps its momentum. This action only tells the browser
// (through touch-action) which drags are its to take.
//
// The action sets `node.style.transform` and `node.style.touchAction` directly;
// the caller must not set either in CSS. It should give the node
// `will-change: transform`, so the picture is already on its own compositor
// layer when a gesture starts. The node is expected to fill its
// parent and letterbox the picture inside itself (object-fit: contain), so a
// gesture can start anywhere on the slide, not only on the picture.

export interface PinchZoomOptions {
	minScale?: number;
	maxScale?: number;
	// Double-tap zooms to at least this much, or further if that is what it
	// takes for the picture to fill the screen.
	doubleTapScale?: number;
	doubleTapMs?: number;
	// Which neighbours the pager has in each direction. A vertical drag toward
	// an existing neighbour belongs to the browser's scroller; a drag toward
	// nothing (past the first or last picture, or either way on a lone picture)
	// is ours and pulls the picture away to dismiss.
	pager?: { prev: boolean; next: boolean };
	// A dismiss drag was released far or fast enough. The picture is already
	// animating off screen when this fires.
	onDismiss?: () => void;
	// Live vertical distance of a dismiss drag (px, 0 on release or cancel) so
	// the host can fade its backdrop as the picture is dragged away.
	onDragProgress?: (dy: number) => void;
	// A single tap that did not become a double-tap. `onPicture` is false when
	// it landed on the empty area around the picture.
	onTap?: (onPicture: boolean) => void;
	// Fired when the picture crosses between "at rest" and "zoomed in".
	onZoomChange?: (zoomed: boolean) => void;
}

const DEFAULTS = {
	minScale: 1,
	maxScale: 4,
	doubleTapScale: 2.5,
	doubleTapMs: 300
};

// Movement (px) before a one-finger drag commits to an axis.
const SLOP = 10;
// Vertical distance (px) that commits a dismiss drag.
const DISMISS_COMMIT_PX = 110;
// px/ms flick velocity that commits a dismiss regardless of distance.
const FLICK_VELOCITY = 0.5;
// A pan released faster than this (px/ms) keeps gliding.
const GLIDE_MIN_VELOCITY = 0.15;
// Time constant (ms) of the glide's decay, the same feel as a system fling.
const GLIDE_DECAY_MS = 325;
const ZOOM_ANIM_MS = 220;
const SETTLE_ANIM_MS = 180;

interface Point {
	x: number;
	y: number;
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

export function pinchZoom(node: HTMLElement, options: PinchZoomOptions = {}) {
	let opts = { ...DEFAULTS, ...options };

	const pointers = new Map<number, Point>();
	let scale = 1;
	let tx = 0;
	let ty = 0;
	let zoomed = false;

	// Two fingers down. Updated incrementally so the point under the fingers
	// stays under them.
	let pinch: { dist: number; mid: Point } | null = null;
	// One finger dragging a zoomed picture, with recent samples for the glide.
	let pan: { x: number; y: number; tx: number; ty: number; trail: { x: number; y: number; t: number }[] } | null = null;
	// One finger down on a picture at rest: undecided until it passes the slop,
	// then either a dismiss drag ('y') or dropped.
	let drag: { x: number; y: number; time: number; axis: 'none' | 'y' } | null = null;
	// The current touch has moved or pinched, so its release is not a tap.
	let moved = false;
	let lastTap: { time: number; x: number; y: number } | null = null;

	let tapTimer: ReturnType<typeof setTimeout> | null = null;
	let animTimer: ReturnType<typeof setTimeout> | null = null;
	let glideFrame = 0;

	function isZoomed(): boolean {
		return scale > opts.minScale + 0.01;
	}

	function restingTouchAction(): string {
		const p = opts.pager;
		if (!p) return 'none';
		// pan-up / pan-down name the direction the CONTENT scrolls, which is the
		// opposite of the finger: pan-down is a finger moving up, toward the
		// next picture.
		if (p.prev && p.next) return 'pan-y';
		if (p.next) return 'pan-down';
		if (p.prev) return 'pan-up';
		return 'none';
	}

	function apply() {
		node.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
		const z = isZoomed();
		node.style.touchAction = z ? 'none' : restingTouchAction();
		if (z !== zoomed) {
			zoomed = z;
			opts.onZoomChange?.(z);
		}
	}

	// Animate the next apply(). Removed afterwards so it never drags behind a
	// finger, which needs instant transform updates.
	function animate(ms: number, easing = 'cubic-bezier(0.2, 0, 0, 1)') {
		node.style.transition = `transform ${ms}ms ${easing}`;
		if (animTimer) clearTimeout(animTimer);
		animTimer = setTimeout(() => {
			animTimer = null;
			node.style.transition = '';
		}, ms + 40);
	}

	// A new touch takes over from any animation or glide still running.
	function stopMotion() {
		if (glideFrame) cancelAnimationFrame(glideFrame);
		glideFrame = 0;
		if (animTimer) clearTimeout(animTimer);
		animTimer = null;
		node.style.transition = '';
	}

	// Centre of the slide, which is where the picture's centre sits at rest.
	function centre(): Point {
		const r = (node.parentElement ?? node).getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	// Size of the picture as drawn inside the node at scale 1.
	function pictureSize(): { w: number; h: number } {
		const w = node.offsetWidth;
		const h = node.offsetHeight;
		if (node instanceof HTMLImageElement && node.naturalWidth > 0 && node.naturalHeight > 0) {
			const k = Math.min(w / node.naturalWidth, h / node.naturalHeight);
			return { w: node.naturalWidth * k, h: node.naturalHeight * k };
		}
		return { w, h };
	}

	function isOnPicture(p: Point): boolean {
		const c = centre();
		const s = pictureSize();
		return Math.abs(p.x - c.x - tx) <= (s.w * scale) / 2 && Math.abs(p.y - c.y - ty) <= (s.h * scale) / 2;
	}

	// Keep the picture's edges from coming inside the screen's, and keep it
	// centred along any axis where it is smaller than the screen.
	function clampPan() {
		const s = pictureSize();
		const maxX = Math.max(0, (s.w * scale - node.offsetWidth) / 2);
		const maxY = Math.max(0, (s.h * scale - node.offsetHeight) / 2);
		tx = clamp(tx, -maxX, maxX);
		ty = clamp(ty, -maxY, maxY);
	}

	function settle() {
		animate(SETTLE_ANIM_MS);
		scale = opts.minScale;
		tx = 0;
		ty = 0;
		apply();
		opts.onDragProgress?.(0);
	}

	function startPan(p: Point, t: number) {
		pan = { x: p.x, y: p.y, tx, ty, trail: [{ x: p.x, y: p.y, t }] };
	}

	function glide(vx: number, vy: number) {
		let last = performance.now();
		const step = (now: number) => {
			const dt = Math.min(now - last, 32);
			last = now;
			const wantX = tx + vx * dt;
			const wantY = ty + vy * dt;
			tx = wantX;
			ty = wantY;
			clampPan();
			// An axis that ran into its edge stops there.
			if (tx !== wantX) vx = 0;
			if (ty !== wantY) vy = 0;
			apply();
			const decay = Math.exp(-dt / GLIDE_DECAY_MS);
			vx *= decay;
			vy *= decay;
			glideFrame = Math.hypot(vx, vy) < 0.02 ? 0 : requestAnimationFrame(step);
		};
		glideFrame = requestAnimationFrame(step);
	}

	// Whether the browser's pager will take a vertical drag in this direction.
	function pagerTakes(dy: number): boolean {
		const p = opts.pager;
		if (!p) return false;
		return dy > 0 ? p.prev : p.next;
	}

	function down(e: PointerEvent) {
		stopMotion();
		const p = { x: e.clientX, y: e.clientY };
		pointers.set(e.pointerId, p);

		if (pointers.size === 2) {
			// A pinch wins over whatever one finger had started.
			if (drag?.axis === 'y') {
				ty = 0;
				opts.onDragProgress?.(0);
				apply();
			}
			drag = null;
			pan = null;
			moved = true;
			const [a, b] = [...pointers.values()];
			pinch = { dist: Math.max(distance(a, b), 1), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
		} else if (pointers.size === 1) {
			moved = false;
			if (isZoomed()) {
				startPan(p, e.timeStamp);
				try {
					node.setPointerCapture(e.pointerId);
				} catch {
					// some pointer types don't support capture; ignore
				}
			} else {
				drag = { x: p.x, y: p.y, time: e.timeStamp, axis: 'none' };
			}
		}
	}

	function move(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		const p = { x: e.clientX, y: e.clientY };
		pointers.set(e.pointerId, p);

		if (pinch && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const dist = Math.max(distance(a, b), 1);
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const c = centre();
			// The point of the picture that was under the fingers...
			const qx = (pinch.mid.x - c.x - tx) / scale;
			const qy = (pinch.mid.y - c.y - ty) / scale;
			scale = clamp((scale * dist) / pinch.dist, opts.minScale, opts.maxScale);
			// ...stays under them at the new size.
			tx = mid.x - c.x - qx * scale;
			ty = mid.y - c.y - qy * scale;
			pinch = { dist, mid };
			clampPan();
			e.preventDefault();
			apply();
		} else if (pan && pointers.size === 1) {
			const dx = p.x - pan.x;
			const dy = p.y - pan.y;
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
			tx = pan.tx + dx;
			ty = pan.ty + dy;
			clampPan();
			pan.trail.push({ x: p.x, y: p.y, t: e.timeStamp });
			if (pan.trail.length > 6) pan.trail.shift();
			e.preventDefault();
			apply();
		} else if (drag && pointers.size === 1) {
			const dx = p.x - drag.x;
			const dy = p.y - drag.y;
			if (drag.axis === 'none') {
				if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return; // still ambiguous
				moved = true;
				if (Math.abs(dx) > Math.abs(dy) || pagerTakes(dy)) {
					// Sideways does nothing; toward a neighbour is the pager's.
					drag = null;
					return;
				}
				// Measure from here so the picture starts moving without a jump.
				drag = { x: p.x, y: p.y, time: e.timeStamp, axis: 'y' };
				return;
			}
			ty = dy;
			opts.onDragProgress?.(Math.abs(dy));
			e.preventDefault();
			apply();
		}
	}

	function releaseCapture(id: number) {
		try {
			if (node.hasPointerCapture(id)) node.releasePointerCapture(id);
		} catch {
			// ignore
		}
	}

	function up(e: PointerEvent) {
		const pt = pointers.get(e.pointerId);
		pointers.delete(e.pointerId);
		releaseCapture(e.pointerId);

		if (pinch) {
			pinch = null;
			if (!isZoomed()) {
				// Pinched back to (or below) rest: snap to exactly centred.
				settle();
			} else if (pointers.size === 1) {
				// One finger still down carries on as a pan, without a jump.
				const [rest] = [...pointers.values()];
				startPan(rest, e.timeStamp);
			}
			return;
		}

		if (pan && pointers.size === 0) {
			const trail = pan.trail;
			pan = null;
			const first = trail[0];
			const last = trail[trail.length - 1];
			const dt = last.t - first.t;
			// A finger that paused before lifting leaves the picture where it is.
			if (moved && dt > 0 && e.timeStamp - last.t < 80) {
				const vx = (last.x - first.x) / dt;
				const vy = (last.y - first.y) / dt;
				if (Math.hypot(vx, vy) > GLIDE_MIN_VELOCITY) glide(vx, vy);
			}
		}

		if (drag && pointers.size === 0) {
			const d = drag;
			drag = null;
			if (d.axis === 'y' && pt) {
				const dy = pt.y - d.y;
				const absDy = Math.abs(dy);
				const dt = Math.max(e.timeStamp - d.time, 1);
				if (absDy > DISMISS_COMMIT_PX || (absDy > SLOP && absDy / dt > FLICK_VELOCITY)) {
					// Carry on in the direction of the drag and off the screen.
					animate(SETTLE_ANIM_MS, 'ease-in');
					ty = Math.sign(dy) * (window.innerHeight || node.offsetHeight);
					apply();
					opts.onDismiss?.();
				} else {
					settle();
				}
				return;
			}
		}
	}

	// Taps come from the browser's own click, not from pointerup: it applies the
	// system's idea of what a tap is (not a drag, not a long press), and a
	// viewer that closes on it cannot leave a stray click for the page beneath.
	function click(e: MouseEvent) {
		if (moved) return;
		const pt = { x: e.clientX, y: e.clientY };
		// Off the picture it reports straight away; on the picture it waits to
		// see whether a second tap makes it a double-tap.
		if (!isOnPicture(pt)) {
			lastTap = null;
			if (tapTimer) clearTimeout(tapTimer);
			tapTimer = null;
			opts.onTap?.(false);
			return;
		}
		if (lastTap && e.timeStamp - lastTap.time < opts.doubleTapMs && distance(pt, lastTap) < 30) {
			lastTap = null;
			if (tapTimer) clearTimeout(tapTimer);
			tapTimer = null;
			animate(ZOOM_ANIM_MS);
			if (isZoomed()) {
				scale = opts.minScale;
				tx = 0;
				ty = 0;
			} else {
				const c = centre();
				const s = pictureSize();
				const cover = Math.max(node.offsetWidth / s.w, node.offsetHeight / s.h);
				scale = clamp(Math.max(opts.doubleTapScale, cover), opts.minScale, opts.maxScale);
				// Keep the tapped spot under the finger.
				tx = (c.x - pt.x) * (scale - 1);
				ty = (c.y - pt.y) * (scale - 1);
				clampPan();
			}
			apply();
		} else {
			lastTap = { time: e.timeStamp, x: pt.x, y: pt.y };
			if (tapTimer) clearTimeout(tapTimer);
			tapTimer = setTimeout(() => {
				tapTimer = null;
				opts.onTap?.(true);
			}, opts.doubleTapMs);
		}
	}

	// The browser took the touch for a scroll (or the system took it away).
	function cancel(e: PointerEvent) {
		pointers.delete(e.pointerId);
		releaseCapture(e.pointerId);
		pinch = null;
		pan = null;
		const wasDragging = drag?.axis === 'y';
		drag = null;
		moved = true;
		if (wasDragging || (!isZoomed() && scale !== opts.minScale)) settle();
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('click', click);
	apply(); // establishes the resting touch-action

	return {
		update(next: PinchZoomOptions) {
			opts = { ...DEFAULTS, ...next };
			apply();
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('click', click);
			stopMotion();
			if (tapTimer) clearTimeout(tapTimer);
		}
	};
}
