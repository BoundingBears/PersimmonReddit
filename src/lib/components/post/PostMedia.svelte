<script lang="ts">
	import ImageView from './ImageView.svelte';
	import VideoView from './VideoView.svelte';
	import GalleryView from './GalleryView.svelte';
	import EmbedView from './EmbedView.svelte';
	import LinkPreview from './LinkPreview.svelte';
	import SelfText from './SelfText.svelte';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
	}

	let { post }: Props = $props();
	// For crossposts, render the upstream post's media.
	let target = $derived(post.kind === 'crosspost' && post.crosspost ? post.crosspost : post);
</script>

{#if target.kind === 'image' && target.image}
	<ImageView
		url={target.image.url}
		width={target.image.width}
		height={target.image.height}
		nsfw={target.over18}
		alt={target.title}
	/>
{:else if target.kind === 'video' && target.video}
	<VideoView video={target.video} poster={target.preview?.url} />
{:else if target.kind === 'gallery' && target.gallery}
	<GalleryView items={target.gallery} nsfw={target.over18} />
{:else if target.kind === 'embed' && target.embed}
	<EmbedView embed={target.embed} />
{:else if target.kind === 'text'}
	{#if target.selftextHtml}
		<div class="self-wrap">
			<SelfText html={target.selftextHtml} />
		</div>
	{:else if target.selftext}
		<div class="self-wrap">
			<SelfText md={target.selftext} />
		</div>
	{/if}
{:else if target.kind === 'link'}
	<div class="link-wrap">
		<LinkPreview url={target.url} domain={target.domain} thumbnail={target.thumbnail} />
	</div>
{/if}

<style>
	.self-wrap {
		padding: 8px 16px;
	}
	.link-wrap {
		padding: 8px 16px;
	}
</style>
