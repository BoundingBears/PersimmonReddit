<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import UserChip from '$lib/components/shared/UserChip.svelte';
	import VoteScore from '$lib/components/shared/VoteScore.svelte';
	import PostMedia from './PostMedia.svelte';
	import { formatScore } from '$lib/utils/format';
	import { hidden } from '$lib/stores/hidden';
	import { saved } from '$lib/stores/saved';
	import { sharePost, copyLink } from '$lib/utils/share';
	import { tick as haptic } from '$lib/utils/haptics';
	import { pushToast } from '$lib/stores/toast';
	import { hiddenMetaFromPost } from '$lib/utils/hiddenMeta';
	import { savedMetaFromPost } from '$lib/utils/savedMeta';
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

	function toggleSave() {
		const id = post.id;
		if ($saved.has(id)) {
			saved.unsave(id);
			haptic();
			pushToast('Removed from saved');
		} else {
			saved.save(id, savedMetaFromPost(post));
			haptic();
			pushToast('Saved', {
				duration: 5000,
				action: { label: 'UNDO', onClick: () => saved.unsave(id) }
			});
		}
	}

	function toggleHide() {
		const id = post.id;
		if ($hidden.has(id)) {
			hidden.unhide(id);
			haptic();
			pushToast('Post is unhidden');
		} else {
			hidden.hide(id, hiddenMetaFromPost(post));
			haptic();
			pushToast('Post is hidden', {
				duration: 5000,
				action: { label: 'UNDO', onClick: () => hidden.unhide(id) }
			});
		}
	}
</script>

<article class="detail">
	<h1 class="title">{post.title}</h1>

	<div class="byline">
		<UserChip name={post.author} />
		<span class="dot">·</span>
		<RelativeTime ts={post.createdUtc} />
		{#if post.flair?.text}
			<span class="dot">·</span>
			<span class="flair">{post.flair.text}</span>
		{/if}
	</div>

	{#if post.over18 || post.spoiler || post.locked || post.archived}
		<div class="flairs">
			{#if post.over18}<span class="flair nsfw">NSFW</span>{/if}
			{#if post.spoiler}<span class="flair spoiler">SPOILER</span>{/if}
			{#if post.locked}<span class="flair locked"><Icon name="lock" size={12} /> LOCKED</span>{/if}
			{#if post.archived}<span class="flair archived">ARCHIVED</span>{/if}
		</div>
	{/if}

	{#if post.kind === 'crosspost' && post.crosspost}
		<div class="crosspost-banner">
			<Icon name="forward" size={16} />
			<span>Crossposted from <a href="/r/{post.crosspost.subreddit}">r/{post.crosspost.subreddit}</a></span>
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
		<button
			class="btn"
			class:active={$saved.has(post.id)}
			onclick={toggleSave}
			aria-label={$saved.has(post.id) ? 'Remove from saved' : 'Save'}
		>
			<Icon name="bookmark" size={20} filled={$saved.has(post.id)} />
		</button>
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
		padding: 0 16px;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.crosspost-banner a {
		color: var(--md-sys-color-primary);
	}
	/* Single quiet byline under the title: author · time · flair. */
	.byline {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 16px;
		font-size: 13px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.dot {
		opacity: 0.6;
	}
	.title {
		margin: 0;
		padding: 12px 16px 0;
		font-size: calc(20px * var(--font-scale));
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
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
	.btn.active {
		color: var(--md-sys-color-primary);
	}
</style>
