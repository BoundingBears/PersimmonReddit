<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { prefs } from '$lib/stores/prefs';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
		onOpen?: (post: Post) => void;
	}

	let { post, onOpen }: Props = $props();
	let thumb = $derived(post.preview?.url ?? post.image?.url ?? post.thumbnail);
	let blur = $derived(post.over18 && $prefs.blurNsfw);

	function open() {
		if (onOpen) onOpen(post);
		else goto(`/comments/${post.id}`);
	}
</script>

<button class="tile" onclick={open} aria-label={post.title}>
	{#if thumb}
		<img src={thumb} alt="" loading="lazy" referrerpolicy="no-referrer" class:blur />
	{:else}
		<div class="placeholder"><Icon name="image" size={32} /></div>
	{/if}
	{#if post.kind === 'video'}
		<span class="badge"><Icon name="play_arrow" size={14} /></span>
	{:else if post.kind === 'gallery'}
		<span class="badge"><Icon name="collections" size={14} /></span>
	{/if}
	<div class="overlay">{post.title}</div>
</button>

<style>
	.tile {
		position: relative;
		display: block;
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-on-surface);
		text-align: left;
		padding: 0;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	img.blur {
		filter: blur(24px);
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--md-sys-color-on-surface-variant);
	}
	.badge {
		position: absolute;
		top: 6px;
		right: 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 3px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		border-radius: 8px;
	}
	.overlay {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 16px 8px 6px;
		font-size: 11px;
		font-weight: 500;
		color: #fff;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
