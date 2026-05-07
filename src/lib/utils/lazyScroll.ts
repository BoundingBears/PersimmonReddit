// Auto-scrolls the window when lazy-mode is on. Touch/mouse interaction pauses
// briefly. Implemented via requestAnimationFrame so we get smooth, jank-free
// scrolling that yields to the user immediately on input.
//
// Usage (in a feed page):
//   import { startLazyScroll } from '$lib/utils/lazyScroll';
//   onMount(() => startLazyScroll(() => $prefs.lazyMode, () => $prefs.lazyModePxPerSec));

import { browser } from '$app/environment';

const RESUME_AFTER_MS = 1500;

export function startLazyScroll(
	enabled: () => boolean,
	pxPerSec: () => number
): () => void {
	if (!browser) return () => {};

	let raf = 0;
	let lastTs = 0;
	let pausedUntil = 0;

	const onInteract = () => {
		pausedUntil = performance.now() + RESUME_AFTER_MS;
	};

	function tick(ts: number) {
		raf = requestAnimationFrame(tick);
		if (!enabled() || ts < pausedUntil) {
			lastTs = ts;
			return;
		}
		if (lastTs === 0) {
			lastTs = ts;
			return;
		}
		const dt = (ts - lastTs) / 1000;
		lastTs = ts;
		const delta = pxPerSec() * dt;
		const before = window.scrollY;
		window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
		// If we couldn't scroll any further, pause briefly so we don't burn CPU.
		if (window.scrollY === before) {
			pausedUntil = ts + 5000;
		}
	}

	window.addEventListener('touchstart', onInteract, { passive: true });
	window.addEventListener('wheel', onInteract, { passive: true });
	window.addEventListener('keydown', onInteract);

	raf = requestAnimationFrame(tick);

	return () => {
		cancelAnimationFrame(raf);
		window.removeEventListener('touchstart', onInteract);
		window.removeEventListener('wheel', onInteract);
		window.removeEventListener('keydown', onInteract);
	};
}
