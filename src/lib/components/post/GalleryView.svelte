<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { prefs } from '$lib/stores/prefs';
	import { openGallery } from '$lib/stores/imageViewer';
	import type { GalleryItem } from '$lib/reddit/types';

	interface Props {
		items: GalleryItem[];
		nsfw?: boolean;
	}

	let { items, nsfw = false }: Props = $props();
	let revealed = $state(false);
	let blurred = $derived(nsfw && $prefs.blurNsfw && !revealed);
	let cover = $derived(items[0]);

	// The post shows the first picture and how many there are. The rest are
	// looked at in the fullscreen viewer, which pages up and down; there is no
	// second, sideways way of flipping through them here.
	function openViewer() {
		openGallery(
			items.map((it) => ({
				url: it.fullUrl ?? it.url,
				preview: it.url,
				pixels: it.width * it.height,
				kind: 'image' as const,
				alt: it.caption ?? '',
				caption: it.caption
			})),
			0
		);
	}
</script>

<div class="wrap" class:blurred>
	{#if cover}
		<img src={cover.url} alt={cover.caption ?? ''} referrerpolicy="no-referrer" />
	{/if}

	{#if !blurred}
		<button
			class="open-hit"
			onclick={openViewer}
			aria-label={items.length > 1 ? `Open gallery of ${items.length} images` : 'Open image fullscreen'}
		></button>
	{/if}

	{#if items.length > 1}
		<div class="count"><Icon name="collections" size={16} /> {items.length}</div>
	{/if}

	{#if cover?.caption}
		<div class="caption">{cover.caption}</div>
	{/if}

	{#if blurred}
		<button class="reveal" onclick={() => (revealed = true)}>Tap to reveal</button>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		background: var(--md-sys-color-surface-container-low);
		min-height: 60vw;
	}
	img {
		display: block;
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
	}
	.blurred img {
		filter: blur(48px);
	}
	.open-hit {
		position: absolute;
		inset: 0;
		z-index: 1;
		background: none;
		cursor: zoom-in;
	}
	/* Same badge a gallery carries on its feed card. */
	.count {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: var(--type-meta);
		z-index: 2;
		pointer-events: none;
	}
	.caption {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font-size: var(--type-secondary);
		z-index: 2;
		pointer-events: none;
	}
	.reveal {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 8px 16px;
		border-radius: 24px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font-weight: var(--weight-title);
		z-index: 2;
	}
</style>
