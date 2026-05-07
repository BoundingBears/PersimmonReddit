<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import {
		drawerOpen,
		closeDrawer,
		dismissDrawerForNavigation,
		installDrawerHistoryListener
	} from '$lib/stores/drawer';
	import { subscribed } from '$lib/stores/subscribed';

	onMount(() => installDrawerHistoryListener());

	function go(path: string) {
		// Don't pop the marker entry — replaceState below overwrites it so the
		// back-stack ends up clean.
		dismissDrawerForNavigation();
		goto(path, { replaceState: true });
	}

	// Subscribed feed lives at /subscribed — Reddit's multireddit URL
	// (r/sub1+sub2) requires OAuth to fetch unauthenticated, so we merge
	// per-sub fetches client-side.
	let hasSubs = $derived($subscribed.length > 0);

	const builtins: Array<{ label: string; href: string; icon: string }> = [
		{ label: 'Home (Hot)', href: '/', icon: 'home' },
		{ label: 'r/popular', href: '/r/popular', icon: 'whatshot' },
		{ label: 'r/all', href: '/r/all', icon: 'public' }
	];

	// Custom slide using percentage transform so it works at any drawer width
	// (drawer is min(80vw, 320px) — px-based fly() over-translates on narrow phones).
	function slideLeft(_node: HTMLElement, { duration = 200 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateX(${-100 * u}%);`
		};
	}
</script>

{#if $drawerOpen}
	<div class="scrim" onclick={closeDrawer} role="presentation" transition:fade={{ duration: 150 }}></div>
	<aside class="drawer" aria-label="Navigation" transition:slideLeft={{ duration: 220 }}>
		<header class="drawer-head">
			<div class="brand">Persimmon</div>
			<button class="iconbtn" onclick={closeDrawer} aria-label="Close"><Icon name="close" size={22} /></button>
		</header>

		<nav class="section">
			<div class="section-title">Browse</div>
			{#each builtins as b (b.href)}
				<button class="row" onclick={() => go(b.href)}>
					<Icon name={b.icon} size={20} />
					<span>{b.label}</span>
				</button>
			{/each}
			{#if hasSubs}
				<button class="row primary" onclick={() => go('/subscribed')}>
					<Icon name="bookmarks" size={20} filled />
					<span>Subscribed feed ({$subscribed.length})</span>
				</button>
			{/if}
		</nav>

		<nav class="section">
			<div class="section-title">Subscribed</div>
			{#if $subscribed.length === 0}
				<div class="empty">No subscriptions yet. Bookmark subreddits from the Subs tab or any subreddit page.</div>
			{:else}
				{#each $subscribed as entry (entry.name)}
					<button class="row" onclick={() => go(`/r/${entry.name}`)}>
						{#if entry.iconImg}
							<img class="sub-icon" src={entry.iconImg} alt="" referrerpolicy="no-referrer" />
						{:else}
							<Icon name="forum" size={20} />
						{/if}
						<span>r/{entry.name}</span>
					</button>
				{/each}
			{/if}
		</nav>

		<nav class="section">
			<div class="section-title">App</div>
			<button class="row" onclick={() => go('/subreddits')}>
				<Icon name="explore" size={20} />
				<span>Discover subreddits</span>
			</button>
			<button class="row" onclick={() => go('/search')}>
				<Icon name="search" size={20} />
				<span>Search</span>
			</button>
			<button class="row" onclick={() => go('/settings')}>
				<Icon name="settings" size={20} />
				<span>Settings</span>
			</button>
		</nav>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
	}
	.drawer {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: min(80vw, 320px);
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		z-index: 101;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding-top: env(safe-area-inset-top);
		padding-bottom: env(safe-area-inset-bottom);
		box-shadow: 4px 0 16px rgba(0, 0, 0, 0.2);
	}
	.drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 8px 16px 20px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.brand {
		font-size: 18px;
		font-weight: 600;
		color: var(--md-sys-color-primary);
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
	}
	.iconbtn:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.section {
		padding: 8px 0;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.section:last-child {
		border-bottom: none;
	}
	.section-title {
		padding: 8px 20px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--md-sys-color-on-surface-variant);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 10px 20px;
		text-align: left;
		font: inherit;
		color: inherit;
	}
	.row:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.row.primary {
		color: var(--md-sys-color-primary);
		font-weight: 500;
	}
	.sub-icon {
		width: 20px;
		height: 20px;
		border-radius: 10px;
		object-fit: cover;
		flex: none;
	}
	.empty {
		padding: 8px 20px 16px;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
