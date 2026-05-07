// Svelte action: triggers `onLongPress` after the user holds the element for
// `durationMs` (default 500ms). Cancels if the pointer moves past
// `movementThresholdPx` (default 10) so a vertical scroll doesn't fire it.
//
// Captures the synthetic `click` that follows pointerup-after-long-press
// so the consumer's `onclick` doesn't also fire (i.e. holding a post card
// triggers the menu without ALSO opening the post detail).

import { ImpactStyle } from '@capacitor/haptics';
import { tick as haptic } from '$lib/utils/haptics';

export interface LongPressOptions {
	onLongPress: () => void;
	durationMs?: number;
	movementThresholdPx?: number;
}

export function longPress(node: HTMLElement, options: LongPressOptions) {
	let opts = options;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;
	let pointerId: number | null = null;
	let fired = false;

	function down(e: PointerEvent) {
		// Mouse: only the primary button. Touch: any.
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// Already tracking a press — ignore additional touches (multi-finger).
		if (timer !== null || pointerId !== null) return;
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		fired = false;
		const duration = opts.durationMs ?? 500;
		timer = setTimeout(() => {
			timer = null;
			fired = true;
			haptic(ImpactStyle.Medium);
			opts.onLongPress();
		}, duration);
	}

	function move(e: PointerEvent) {
		if (timer === null || e.pointerId !== pointerId) return;
		const threshold = opts.movementThresholdPx ?? 10;
		if (
			Math.abs(e.clientX - startX) > threshold ||
			Math.abs(e.clientY - startY) > threshold
		) {
			cancel();
		}
	}

	function up(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		cancel();
	}

	function cancel() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		pointerId = null;
	}

	// Capture-phase listener: if we just fired a long-press, swallow the
	// synthetic click that the WebView sometimes still synthesizes after a
	// long pointerup, so the consumer's onclick handler doesn't also run.
	function click(e: MouseEvent) {
		if (fired) {
			e.stopImmediatePropagation();
			e.preventDefault();
			fired = false;
		}
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('click', click, true);

	return {
		update(next: LongPressOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('click', click, true);
			cancel();
		}
	};
}
