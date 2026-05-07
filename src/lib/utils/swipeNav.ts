// Svelte action: detects horizontal swipes on an element and calls onPrev/onNext.
// Vertical drags are ignored so they pass through to the page's normal scrolling.
// On commit, fires a light haptic.

import { tick as haptic } from './haptics';

const COMMIT_DISTANCE = 80; // px
const MAX_VERTICAL = 60; // px — beyond this we treat the gesture as a vertical scroll

interface Options {
	onPrev?: () => void;
	onNext?: () => void;
}

export function swipeNav(node: HTMLElement, opts: Options) {
	let opts$ = opts;
	let startX = 0;
	let startY = 0;
	let active = false;

	function down(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		startX = e.clientX;
		startY = e.clientY;
		active = true;
	}

	function up(e: PointerEvent) {
		if (!active) return;
		active = false;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.abs(dy) > MAX_VERTICAL) return;
		if (Math.abs(dx) < COMMIT_DISTANCE) return;
		if (dx > 0 && opts$.onPrev) {
			haptic();
			opts$.onPrev();
		} else if (dx < 0 && opts$.onNext) {
			haptic();
			opts$.onNext();
		}
	}

	function cancel() {
		active = false;
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);

	return {
		update(next: Options) {
			opts$ = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		}
	};
}

