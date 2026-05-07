<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '$lib/components/shared/Icon.svelte';

	const tabs = [
		{ href: '/', icon: 'home', label: 'Home' },
		{ href: '/subreddits', icon: 'forum', label: 'Subs' },
		{ href: '/search', icon: 'search', label: 'Search' },
		{ href: '/settings', icon: 'settings', label: 'Settings' }
	] as const;

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

<nav class="nav">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={isActive(tab.href, $page.url.pathname)}
			onclick={(e) => {
				const current = $page.url.pathname;

				// Tapping the active tab: scroll to top, no nav (mobile convention).
				if (isActive(tab.href, current)) {
					e.preventDefault();
					window.scrollTo({ top: 0, behavior: 'smooth' });
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
						const steps = navHistory.length - 1 - idx;
						history.go(-steps);
						return;
					}
				}
				// Otherwise: let the default <a> push to navigate forward.
			}}
		>
			<Icon name={tab.icon} size={24} filled={isActive(tab.href, $page.url.pathname)} />
			<span class="label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.nav {
		position: sticky;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		background: var(--md-sys-color-surface-container);
		border-top: 1px solid var(--md-sys-color-outline-variant);
		padding-bottom: env(safe-area-inset-bottom);
		z-index: 10;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 8px 0 10px;
		color: var(--md-sys-color-on-surface-variant);
		font-size: 11px;
	}
	.tab.active {
		color: var(--md-sys-color-primary);
	}
	.tab:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.label {
		font-weight: 500;
	}
</style>
