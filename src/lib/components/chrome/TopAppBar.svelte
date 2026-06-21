<script lang="ts">
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

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
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
		font-size: 18px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: inherit;
	}
	.title.dense {
		font-size: 15px;
		font-weight: 500;
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
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>
