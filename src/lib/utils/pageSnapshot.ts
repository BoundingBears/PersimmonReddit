// Captures lightweight snapshots of the page's main content area before
// each navigation, so the edge-swipe-back gesture can show a real preview
// of the previous page underneath the current one as you drag.
//
// The snapshot is just an innerHTML string + the body's computed background
// color. Browsers will re-render it (cached resources don't re-fetch), and
// because it's static HTML there are no event listeners or live behavior.
// This is roughly 1-2 orders of magnitude lighter than canvas-based
// approaches like html2canvas, and good enough as a visual peek during a
// 200ms gesture animation.
//
// Stored as a stack mirroring the history stack: forward navigations push
// the leaving page; popstate-back navigations pop. Without the stack, two
// quick back-swipes would show the same snapshot twice — the swipe itself
// triggers history.back(), which fires beforeNavigate again and would
// overwrite the slot with the page we're currently leaving (i.e., the page
// the user just navigated *to* via the swipe). The peek for the next swipe
// would then be that same page rather than the one further back.

import { isIOS } from './iosOverlay';

export interface PageSnapshot {
	html: string;
	bgColor: string;
}

let stack: PageSnapshot[] = [];

export function pushPageSnapshot(): void {
	// Only iOS uses this (for the edge-swipe-back peek layer). Skip on
	// Android and web to avoid the cost of innerHTML serialization on
	// every navigation.
	if (!isIOS()) return;
	if (typeof document === 'undefined') return;
	// Capture `.app` (not `main.main`) so the BottomNav is included in the
	// snapshot. The BottomNav is a sibling of `<main>` inside `.app`, and
	// without it the peek shows the page content but a black gap where the
	// nav would sit, then the nav appears suddenly when the swipe completes.
	const app = document.querySelector('.app');
	if (!app) return;
	let bgColor = '';
	try {
		bgColor = getComputedStyle(document.body).backgroundColor || '';
	} catch {
		// ignore
	}
	stack.push({ html: app.innerHTML, bgColor });
}

export function popPageSnapshot(): void {
	stack.pop();
}

export function getPageSnapshot(): PageSnapshot | null {
	return stack.length > 0 ? stack[stack.length - 1] : null;
}

export function clearPageSnapshot(): void {
	stack = [];
}
