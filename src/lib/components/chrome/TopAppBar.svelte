<script lang="ts">
	import UpdateBanner from '$lib/components/shared/UpdateBanner.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { openDrawer } from '$lib/stores/drawer';

	interface Props {
		title: string;
		titleHref?: string;
		subtitle?: string;
		showBack?: boolean;
		// Demote the title to a small context label (used where the page has its
		// own hero, e.g. the post view's title-first header).
		dense?: boolean;
		onBack?: () => void;
		onMenu?: () => void;
		actions?: import('svelte').Snippet;
	}

	let { title, titleHref, subtitle, showBack = false, dense = false, onBack, onMenu, actions }: Props = $props();

	function handleLeading() {
		if (showBack) {
			if (onBack) onBack();
			else history.back();
			return;
		}
		// hamburger: explicit handler if provided, otherwise open the global drawer
		if (onMenu) onMenu();
		else openDrawer();
	}
</script>

<!-- The update banner lives inside the app bar's sticky wrapper, not above it in
     the layout. It used to be the first child of <main>, which put it ABOVE the
     app bar with nothing owning the status-bar inset: under Android's enforced
     edge-to-edge (targetSdk 36) the WebView draws behind the status bar, the app
     bar compensates with env(safe-area-inset-top), and the banner — sitting
     above it — rendered underneath the clock and battery where taps go to the
     system, not to us. Sticking it to the app bar means exactly one element
     carries the inset and the banner is always on screen and always tappable. -->
<div class="bar-wrap">
<header class="bar">
	<button class="leading" onclick={handleLeading} aria-label={showBack ? 'Back' : 'Menu'}>
		<Icon name={showBack ? 'arrow_back' : 'menu'} size={24} />
	</button>
	<div class="titles">
		{#if titleHref}
			<a class="title link" class:dense href={titleHref}>
				<span class="title-text">{title}</span>
				{#if !dense}<Icon name="chevron_right" size={18} />{/if}
			</a>
		{:else}
			<div class="title" class:dense>{title}</div>
		{/if}
		{#if subtitle}
			<div class="subtitle">{subtitle}</div>
		{/if}
	</div>
	<div class="actions">
		{#if actions}{@render actions()}{/if}
	</div>
</header>
	<UpdateBanner />
</div>

<style>
	.bar-wrap {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--md-sys-color-surface);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: calc(8px + env(safe-area-inset-top)) 8px 8px 4px;
		min-height: calc(56px + env(safe-area-inset-top));
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.leading {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
	}
	.leading:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.titles {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.title {
		font-size: var(--type-headline);
		font-weight: var(--weight-title);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: inherit;
	}
	.title.dense {
		font-size: var(--type-body-lg);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface-variant);
	}
	.title.link {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		max-width: 100%;
		margin-left: -8px;
		padding: 2px 4px 2px 8px;
		border-radius: 8px;
		text-decoration: none;
	}
	.title.link .title-text {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* Chevron signals the title navigates (to the subreddit). Muted so it doesn't
	   compete with the name. */
	.title.link :global(.material-symbols-rounded) {
		color: var(--md-sys-color-on-surface-variant);
		flex: none;
	}
	.title.link:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.subtitle {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>
