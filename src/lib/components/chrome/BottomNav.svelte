<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { activeScrollToTop } from '$lib/utils/scroller';
	import { page } from '$app/stores';
	import Icon from '$lib/components/shared/Icon.svelte';

	const tabs = [
		{ href: '/', icon: 'home', label: 'Home' },
		{ href: '/subreddits', icon: 'forum', label: 'Subs' },
		{ href: '/search', icon: 'search', label: 'Search' },
		{ href: '/saved', icon: 'bookmark', label: 'Saved' }
	] as const;

	// The bar is fixed to the bottom of the screen, out of the page's flow.
	// The page reserves room for it and the post layer stops at its top (both
	// in +layout.svelte), so both need to know how tall it is, inset included.
	let navEl: HTMLElement | undefined = $state();
	onMount(() => {
		if (!navEl || typeof ResizeObserver === 'undefined') return;
		const el = navEl;
		const publish = () => document.documentElement.style.setProperty('--bottom-nav-h', `${el.offsetHeight}px`);
		const observer = new ResizeObserver(publish);
		observer.observe(el);
		publish();
		return () => observer.disconnect();
	});

	function isActive(href: string, current: string): boolean {
		if (href === '/') return current === '/';
		return current === href || current.startsWith(href + '/');
	}

	// Local history mirror — we track every visited path so we can dedupe
	// tab navigation. If you tap a tab whose path is already somewhere in your
	// history, we go *back* to it instead of pushing a new entry. Result:
	// - Home → Subs → Home → Subs → Home: history stays at most ['/', '/subreddits']
	// - Home → Subs → r/Android → tap Home: jumps back 2 entries to Home
	// - Tabs you've never visited push as normal
	let navHistory = $state<string[]>([]);

	afterNavigate((nav) => {
		const path = nav.to?.url.pathname;
		if (!path) return;

		if (nav.type === 'popstate') {
			// Back / forward gesture — sync our mirror by truncating to the
			// entry that matches the current path, walking from the end.
			const idx = navHistory.lastIndexOf(path);
			if (idx >= 0) {
				navHistory = navHistory.slice(0, idx + 1);
			} else {
				// Unknown — reset (shouldn't normally happen)
				navHistory = [path];
			}
		} else if (nav.type === 'enter') {
			// Initial mount
			if (navHistory.length === 0) navHistory = [path];
		} else {
			// Forward push (link click, goto)
			if (navHistory[navHistory.length - 1] !== path) {
				navHistory = [...navHistory, path];
			}
		}
	});
</script>

<nav class="nav" bind:this={navEl}>
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={isActive(tab.href, $page.url.pathname)}
			onclick={(e) => {
				const current = $page.url.pathname;
				// A post open in the layer is one more history entry than the
				// pages this component has seen navigate.
				const layerOpen = !!$page.state.postId;

				// Tapping the active tab: back out of an open post to the tab's
				// own page, otherwise scroll to top (mobile convention).
				if (isActive(tab.href, current)) {
					e.preventDefault();
					if (layerOpen) history.back();
					else activeScrollToTop();
					return;
				}

				// Smart dedup: if this tab is already somewhere in our back
				// history, go back to that entry instead of pushing forward.
				// Excludes the current entry (the last one in navHistory).
				const lastSearchableIdx = navHistory.length - 2;
				if (lastSearchableIdx >= 0) {
					const idx = navHistory.lastIndexOf(tab.href, lastSearchableIdx);
					if (idx >= 0) {
						e.preventDefault();
						const steps = navHistory.length - 1 - idx + (layerOpen ? 1 : 0);
						history.go(-steps);
						return;
					}
				}
				// Otherwise: let the default <a> push to navigate forward.
			}}
		>
			<span class="pill"><Icon name={tab.icon} size={24} filled={isActive(tab.href, $page.url.pathname)} /></span>
			<span class="label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.nav {
		/* Fixed, not sticky. A sticky bar is only pinned on a page long enough
		   to scroll; on a short one it simply sits at the end of the page. The
		   two positions were a pixel apart, so the bar hopped up and down
		   between tabs. Fixed is the same place on every page. It also cannot
		   land a sub-pixel short of the edge at a fractional scroll offset,
		   which is what the old one-pixel overhang was compensating for. */
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		background: var(--md-sys-color-surface-container);
		border-top: 1px solid var(--md-sys-color-outline-variant);
		padding-bottom: env(safe-area-inset-bottom);
		/* Above the post layer (20), which covers the page and its app bar. */
		z-index: 30;
		/* Its own group in page transitions, held still (see app.css). */
		view-transition-name: bottom-nav;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 8px 0 9px;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--type-caption);
		outline: none;
	}
	.tab.active {
		color: var(--md-sys-color-on-surface);
	}
	/* The tab's highlight is a pill behind its icon. It marks the tab you are
	   on, and it is also what answers a press: the whole cell used to flash as
	   a grey square under the finger. */
	.pill {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 30px;
		border-radius: 15px;
	}
	.pill::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--md-sys-color-secondary-container);
		opacity: 0;
		transform: scaleX(0.5);
		transition:
			opacity 140ms ease,
			transform 240ms cubic-bezier(0.2, 0, 0, 1);
	}
	.pill > :global(*) {
		position: relative;
	}
	.tab.active .pill::before {
		opacity: 1;
		transform: none;
	}
	.tab:active .pill::before {
		opacity: 0.55;
		transform: none;
	}
	.tab.active .pill {
		color: var(--md-sys-color-primary);
	}
	.tab:focus-visible .pill {
		outline: 2px solid var(--md-sys-color-primary);
		outline-offset: 2px;
	}
	.label {
		font-weight: var(--weight-title);
	}
</style>
