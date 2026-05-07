<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { prefs } from '$lib/stores/prefs';
	import type { GalleryItem } from '$lib/reddit/types';

	interface Props {
		items: GalleryItem[];
		nsfw?: boolean;
	}

	let { items, nsfw = false }: Props = $props();
	let index = $state(0);
	let revealed = $state(false);
	let blurred = $derived(nsfw && $prefs.blurNsfw && !revealed);

	function prev() {
		index = (index - 1 + items.length) % items.length;
	}
	function next() {
		index = (index + 1) % items.length;
	}
</script>

<div class="wrap" class:blurred>
	{#each items as item, i}
		<img
			class:active={i === index}
			src={item.url}
			alt={item.caption ?? ''}
			loading={i === 0 ? 'eager' : 'lazy'}
			referrerpolicy="no-referrer"
		/>
	{/each}

	{#if items.length > 1}
		<button class="nav left" onclick={prev} aria-label="Previous"><Icon name="chevron_left" size={28} /></button>
		<button class="nav right" onclick={next} aria-label="Next"><Icon name="chevron_right" size={28} /></button>
		<div class="counter">{index + 1} / {items.length}</div>
	{/if}

	{#if items[index]?.caption}
		<div class="caption">{items[index].caption}</div>
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
		display: none;
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
	}
	img.active {
		display: block;
	}
	.blurred img.active {
		filter: blur(48px);
	}
	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		border-radius: 20px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.nav.left {
		left: 8px;
	}
	.nav.right {
		right: 8px;
	}
	.counter {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 4px 8px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font-size: 12px;
	}
	.caption {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font-size: 13px;
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
		font-weight: 500;
	}
</style>
