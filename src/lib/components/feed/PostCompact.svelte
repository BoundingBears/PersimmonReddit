<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import { formatScore } from '$lib/utils/format';
	import { prefs } from '$lib/stores/prefs';
	import { openPostActions } from '$lib/stores/postActions';
	import { longPress } from '$lib/actions/longPress';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
		onOpen?: (post: Post) => void;
	}

	let { post, onOpen }: Props = $props();
	let thumb = $derived(post.thumbnail ?? post.preview?.url);
	let blur = $derived(post.over18 && $prefs.blurNsfw);

	function open() {
		if (onOpen) onOpen(post);
		else goto(`/comments/${post.id}`);
	}
</script>

<article
	class="row"
	onclick={open}
	onkeydown={(e) => e.key === 'Enter' && open()}
	tabindex="0"
	use:longPress={{ onLongPress: () => openPostActions(post) }}
>
	<div class="thumb" class:blur>
		{#if thumb}
			<img src={thumb} alt="" loading="lazy" referrerpolicy="no-referrer" />
		{:else}
			<Icon name={post.kind === 'text' ? 'description' : post.kind === 'link' ? 'link' : 'image'} size={20} />
		{/if}
	</div>
	<div class="body">
		<div class="title">{post.title}</div>
		<div class="meta">
			<span>r/{post.subreddit}</span>
			<span>·</span>
			<RelativeTime ts={post.createdUtc} />
			<span>·</span>
			<span>{formatScore(post.score)} pts</span>
			<span>·</span>
			<span>{formatScore(post.numComments)} cmts</span>
		</div>
	</div>
</article>

<style>
	.row {
		display: flex;
		gap: 12px;
		padding: 10px 14px;
		background: var(--md-sys-color-surface);
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
		cursor: pointer;
	}
	.row:active {
		background: var(--md-sys-color-surface-container);
	}
	.thumb {
		width: 64px;
		height: 64px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		overflow: hidden;
		background: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-on-surface-variant);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb.blur img {
		filter: blur(20px);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		font-size: 11px;
		color: var(--md-sys-color-on-surface-variant);
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
</style>
