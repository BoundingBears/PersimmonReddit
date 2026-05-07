<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import UserChip from '$lib/components/shared/UserChip.svelte';
	import VoteScore from '$lib/components/shared/VoteScore.svelte';
	import PostMedia from './PostMedia.svelte';
	import { formatScore } from '$lib/utils/format';
	import { hidden } from '$lib/stores/hidden';
	import { sharePost, copyLink } from '$lib/utils/share';
	import { tick as haptic } from '$lib/utils/haptics';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
	}

	let { post }: Props = $props();

	let permalink = $derived(`https://www.reddit.com${post.permalink}`);

	function onShare() {
		sharePost({ url: permalink, title: post.title });
	}

	function onCopy() {
		copyLink(permalink);
	}

	function toggleHide() {
		if ($hidden.has(post.id)) hidden.unhide(post.id);
		else hidden.hide(post.id);
		haptic();
	}
</script>

<article class="detail">
	{#if post.kind === 'crosspost' && post.crosspost}
		<div class="crosspost-banner">
			<Icon name="forward" size={16} />
			<span>Crossposted from <a href="/r/{post.crosspost.subreddit}">r/{post.crosspost.subreddit}</a></span>
		</div>
	{/if}

	<div class="meta">
		<UserChip name={post.author} />
		<span class="dot">·</span>
		<RelativeTime ts={post.createdUtc} />
	</div>

	<h1 class="title">{post.title}</h1>

	{#if post.flair?.text || post.over18 || post.spoiler || post.locked || post.archived}
		<div class="flairs">
			{#if post.flair?.text}
				<span class="flair">{post.flair.text}</span>
			{/if}
			{#if post.over18}<span class="flair nsfw">NSFW</span>{/if}
			{#if post.spoiler}<span class="flair spoiler">SPOILER</span>{/if}
			{#if post.locked}<span class="flair locked"><Icon name="lock" size={12} /> LOCKED</span>{/if}
			{#if post.archived}<span class="flair archived">ARCHIVED</span>{/if}
		</div>
	{/if}

	<PostMedia {post} />

	<footer class="actions">
		<VoteScore score={post.score} />
		<span class="action">
			<Icon name="comment" size={18} />
			{formatScore(post.numComments)}
		</span>
		<span class="spacer"></span>
		<button class="btn" onclick={toggleHide} aria-label={$hidden.has(post.id) ? 'Unhide' : 'Hide'}>
			<Icon name={$hidden.has(post.id) ? 'visibility' : 'visibility_off'} size={20} />
		</button>
		<button class="btn" onclick={onCopy} aria-label="Copy link"><Icon name="link" size={20} /></button>
		<button class="btn" onclick={onShare} aria-label="Share"><Icon name="share" size={20} /></button>
	</footer>
</article>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 8px;
		background: var(--md-sys-color-surface);
	}
	.crosspost-banner {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px 0;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.crosspost-banner a {
		color: var(--md-sys-color-primary);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 16px;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.dot {
		opacity: 0.6;
	}
	.title {
		margin: 0;
		padding: 0 16px;
		font-size: 18px;
		font-weight: 500;
		line-height: 1.3;
	}
	.flairs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 0 16px;
	}
	.flair {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 500;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
	}
	.flair.nsfw {
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		border-top: 1px solid var(--md-sys-color-outline-variant);
		color: var(--md-sys-color-on-surface-variant);
		font-size: 13px;
	}
	.action {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.spacer {
		flex: 1;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 18px;
	}
	.btn:active {
		background: var(--md-sys-color-surface-container-high);
	}
</style>
