<script lang="ts">
	import ImageView from './ImageView.svelte';
	import VideoView from './VideoView.svelte';
	import GalleryView from './GalleryView.svelte';
	import EmbedView from './EmbedView.svelte';
	import LinkPreview from './LinkPreview.svelte';
	import SelfText from './SelfText.svelte';
	import { resolveEmbed } from '$lib/reddit/embeds';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
	}

	let { post }: Props = $props();
	// For crossposts, render the upstream post's media.
	let target = $derived(post.kind === 'crosspost' && post.crosspost ? post.crosspost : post);

	// A player we can build from the link itself. Tried for anything that is not
	// already a Reddit-hosted video: embeds, plain links to a known provider, and
	// a 'video' whose reddit_video never arrived.
	// Inline, an image post shows the screen-sized rendition; the original is
	// kept for the zoomable viewer. Except GIFs: Reddit's renditions of a GIF
	// are still frames, so only the real URL animates.
	let inlineImage = $derived(
		target.image && !/\.gif(\?|$)/i.test(target.image.url) && target.preview
			? target.preview
			: target.image
	);

	const parentHost = typeof location !== 'undefined' ? location.hostname : 'localhost';
	let hostedVideo = $derived(target.kind === 'video' && !!target.video);
	let direct = $derived(
		!hostedVideo && (target.kind === 'embed' || target.kind === 'link' || target.kind === 'video')
			? resolveEmbed(target.url, parentHost)
			: null
	);
</script>

{#if target.kind === 'image' && target.image}
	<ImageView
		url={inlineImage?.url ?? target.image.url}
		fullUrl={target.image.url}
		fullPixels={target.image.width * target.image.height}
		width={inlineImage?.width ?? target.image.width}
		height={inlineImage?.height ?? target.image.height}
		nsfw={target.over18}
		alt={target.title}
	/>
{:else if target.kind === 'video' && target.video}
	<VideoView video={target.video} poster={target.preview?.url} />
{:else if target.kind === 'gallery' && target.gallery}
	<GalleryView items={target.gallery} nsfw={target.over18} />
{:else if direct || target.embed}
	<EmbedView
		{direct}
		embed={target.embed}
		poster={target.preview?.url ?? target.thumbnail}
		url={target.url}
		domain={target.domain}
	/>
{:else if target.kind === 'text' && target.preview}
	<!-- A text post can carry a picture too: Reddit attaches the preview of the
	     first link in its body. The feed card shows it, so the post has to as
	     well, or it looks like the image vanished on the way in. -->
	<ImageView
		url={target.preview.url}
		fullUrl={target.previewSource?.url ?? target.preview.url}
		fullPixels={(target.previewSource?.width ?? 0) * (target.previewSource?.height ?? 0)}
		width={target.preview.width}
		height={target.preview.height}
		nsfw={target.over18}
		alt={target.title}
	/>
{:else if target.kind !== 'text'}
	<!-- Last resort for ANY non-text post, not only kind 'link'. A video or
	     embed whose data never arrived used to fall through every branch and
	     render nothing, so the media simply vanished from the post. -->
	<div class="link-wrap">
		<LinkPreview url={target.url} domain={target.domain} thumbnail={target.thumbnail} />
	</div>
{/if}

<!-- Body text renders alongside the media, not instead of it: modern Reddit
     posts can carry a selftext body on image/video/gallery/link posts too. -->
{#if target.selftextHtml}
	<div class="self-wrap">
		<SelfText html={target.selftextHtml} />
	</div>
{:else if target.selftext}
	<div class="self-wrap">
		<SelfText md={target.selftext} />
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
