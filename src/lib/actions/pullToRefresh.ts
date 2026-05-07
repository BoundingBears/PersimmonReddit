// Svelte action that turns a scrollable element's overscroll into a refresh
// gesture. Extracted from FeedList.svelte so PostDetail (and any other
// scrollable screen) can reuse the same feel.
//
// Why raw touch events (not pointer events) and `passive: false` on touchmove:
//   Svelte's `on:*` bindings are passive-by-default for touchmove on Android
//   WebView, which means preventDefault() is a no-op and the browser scrolls
//   before we can react. The only reliable way to call preventDefault during
//   a touchmove is via addEventListener with explicit `passive: false`.

import { tick as haptic } from '$lib/utils/haptics';

const DEFAULT_THRESHOLD = 80;
const DEFAULT_MAX = 140;

export interface PullToRefreshState {
	distance: number;
	refreshing: boolean;
}

export interface PullToRefreshOptions {
	onRefresh: () => Promise<void> | void;
	onState?: (s: PullToRefreshState) => void;
	threshold?: number;
	max?: number;
}

export function pullToRefresh(node: HTMLElement, options: PullToRefreshOptions) {
	let opts = options;
	let threshold = opts.threshold ?? DEFAULT_THRESHOLD;
	let max = opts.max ?? DEFAULT_MAX;

	let pullDistance = 0;
	let refreshing = false;
	let startY = -1;
	let active = false;

	function emit() {
		opts.onState?.({ distance: pullDistance, refreshing });
	}

	function start(e: TouchEvent) {
		if (refreshing) return;
		if (window.scrollY > 0) return;
		startY = e.touches[0].clientY;
		active = false;
	}

	function move(e: TouchEvent) {
		if (startY < 0 || refreshing) return;
		const delta = e.touches[0].clientY - startY;
		if (delta < 0 || window.scrollY > 0) {
			startY = -1;
			active = false;
			pullDistance = 0;
			emit();
			return;
		}
		if (!active && delta < 8) return;
		active = true;
		// Stop the browser from doing its own scroll on this move.
		if (e.cancelable) e.preventDefault();
		// Rubber-band: distance past `max` gets damped 5x.
		const damped = delta < max ? delta : max + (delta - max) * 0.2;
		const prev = pullDistance;
		pullDistance = Math.min(damped, max + 30);
		emit();
		// Snap-point haptic when crossing the arm threshold upward.
		if (prev < threshold && pullDistance >= threshold) haptic();
	}

	function end() {
		const wasActive = active;
		const distance = pullDistance;
		startY = -1;
		active = false;
		if (!wasActive) {
			pullDistance = 0;
			emit();
			return;
		}
		if (distance >= threshold) {
			refreshing = true;
			pullDistance = threshold;
			emit();
			Promise.resolve(opts.onRefresh())
				.catch((e) => console.error('refresh failed', e))
				.finally(() => {
					refreshing = false;
					pullDistance = 0;
					emit();
				});
		} else {
			pullDistance = 0;
			emit();
		}
	}

	node.addEventListener('touchstart', start, { passive: true });
	node.addEventListener('touchmove', move, { passive: false });
	node.addEventListener('touchend', end);
	node.addEventListener('touchcancel', end);

	return {
		update(next: PullToRefreshOptions) {
			opts = next;
			threshold = opts.threshold ?? DEFAULT_THRESHOLD;
			max = opts.max ?? DEFAULT_MAX;
		},
		destroy() {
			node.removeEventListener('touchstart', start);
			node.removeEventListener('touchmove', move);
			node.removeEventListener('touchend', end);
			node.removeEventListener('touchcancel', end);
		}
	};
}
