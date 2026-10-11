// Which element is doing the scrolling the user sees. Normally the window.
// While a post is open in the layer over a list (see postLayer.ts) it is that
// layer, and the window underneath belongs to the list and must be left alone.
//
// Anything that reads or drives "the page's" scroll position without owning a
// particular element goes through here: lazy auto-scroll, the session save,
// the bottom bar's scroll-to-top.

let active: HTMLElement | null = null;

export function setActiveScroller(el: HTMLElement | null): void {
	active = el;
}

export function activeScrollTop(): number {
	return active ? active.scrollTop : window.scrollY;
}

export function activeScrollBy(delta: number): void {
	(active ?? window).scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
}

export function activeScrollToTop(): void {
	(active ?? window).scrollTo({ top: 0, behavior: 'smooth' });
}
