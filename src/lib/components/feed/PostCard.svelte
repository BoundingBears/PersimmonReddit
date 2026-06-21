<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import SubredditChip from '$lib/components/shared/SubredditChip.svelte';
	import UserChip from '$lib/components/shared/UserChip.svelte';
	import VoteScore from '$lib/components/shared/VoteScore.svelte';
	import { formatScore } from '$lib/utils/format';
	import { prefs } from '$lib/stores/prefs';
	import { readPosts } from '$lib/stores/readPosts';
	import { saved } from '$lib/stores/saved';
	import { sharePost } from '$lib/utils/share';
	import { savedMetaFromPost } from '$lib/utils/savedMeta';
	import { tick as haptic } from '$lib/utils/haptics';
	import { pushToast } from '$lib/stores/toast';
	import { openPostActions } from '$lib/stores/postActions';
	import { longPress } from '$lib/actions/longPress';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		post: Post;
		onOpen?: (post: Post) => void;
	}

	let { post, onOpen }: Props = $props();

	let preview = $derived(post.preview ?? post.image);
	let revealed = $state(false);
	let blur = $derived(post.over18 && $prefs.blurNsfw && !revealed);
	let visited = $derived($prefs.markPostsRead && $readPosts.has(post.id));

	function reveal(e: MouseEvent) {
		e.stopPropagation();
		revealed = true;
	}

	function open(e?: Event) {
		if (e && (e.target as HTMLElement | null)?.closest('a')) return;
		if (onOpen) onOpen(post);
		else goto(`/comments/${post.id}`);
	}

	function onShare(e: MouseEvent) {
		e.stopPropagation();
		sharePost({ url: `https://www.reddit.com${post.permalink}`, title: post.title });
	}

	function onSave(e: MouseEvent) {
		e.stopPropagation();
		const id = post.id;
		if ($saved.has(id)) {
			saved.unsave(id);
			haptic();
		} else {
			saved.save(id, savedMetaFromPost(post));
			haptic();
			pushToast('Saved', {
				duration: 5000,
				action: { label: 'UNDO', onClick: () => saved.unsave(id) }
			});
		}
	}
</script>

<article
	class="card"
	onclick={open}
	onkeydown={(e) => e.key === 'Enter' && open()}
	tabindex="0"
	use:longPress={{ onLongPress: () => openPostActions(post) }}
>
	<header class="meta">
		<SubredditChip name={post.subreddit} />
		<span class="dot">·</span>
		<UserChip name={post.author} />
		<span class="dot">·</span>
		<RelativeTime ts={post.createdUtc} />
		{#if post.stickied}
			<span class="badge sticky"><Icon name="push_pin" size={14} /></span>
		{/if}
	</header>

	<h2 class="title" class:visited>{post.title}</h2>

	{#if post.flair?.text || post.over18 || post.spoiler}
		<div class="flairs">
			{#if post.flair?.text}
				<span class="flair" style:background={post.flair.backgroundColor || 'var(--md-sys-color-surface-container-high)'} style:color={post.flair.textColor === 'light' ? '#fff' : 'inherit'}>
					{post.flair.text}
				</span>
			{/if}
			{#if post.over18}<span class="flair nsfw">NSFW</span>{/if}
			{#if post.spoiler}<span class="flair spoiler">SPOILER</span>{/if}
		</div>
	{/if}

	{#if preview}
		<div class="preview" class:blur>
			<img
				src={preview.url}
				alt={post.title}
				loading="lazy"
				referrerpolicy="no-referrer"
				width={preview.width || undefined}
				height={preview.height || undefined}
			/>
			{#if blur}
				<button class="reveal" onclick={reveal}>Tap to reveal</button>
			{/if}
			{#if post.kind === 'video' && !blur}
				<div class="play"><Icon name="play_arrow" size={48} /></div>
			{/if}
			{#if post.kind === 'gallery'}
				<div class="badge-corner"><Icon name="collections" size={16} /> {post.gallery?.length ?? ''}</div>
			{/if}
		</div>
	{:else if post.kind === 'text' && post.selftext}
		<p class="selftext">{post.selftext.slice(0, 240)}{post.selftext.length > 240 ? '…' : ''}</p>
	{:else if post.kind === 'link'}
		<div class="linkbar">
			<Icon name="link" size={16} />
			<span class="domain">{post.domain}</span>
		</div>
	{/if}

	<footer class="actions">
		<VoteScore score={post.score} />
		<span class="action">
			<Icon name="comment" size={18} />
			{formatScore(post.numComments)}
		</span>
		<span class="spacer"></span>
		<button
			class="action btn"
			class:active={$saved.has(post.id)}
			onclick={onSave}
			aria-label={$saved.has(post.id) ? 'Remove from saved' : 'Save'}
		>
			<Icon name="bookmark" size={18} filled={$saved.has(post.id)} />
		</button>
		<button class="action btn" onclick={onShare} aria-label="Share">
			<Icon name="share" size={18} />
		</button>
	</footer>
</article>

<style>
	.card {
		background: var(--md-sys-color-surface-container);
		border-radius: 16px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		cursor: pointer;
	}
	.card:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		flex-wrap: wrap;
	}
	.dot {
		opacity: 0.6;
	}
	.title {
		margin: 0;
		font-size: calc(16px * var(--font-scale));
		font-weight: 500;
		line-height: 1.3;
	}
	.title.visited {
		color: var(--md-sys-color-on-surface-variant);
	}
	.flairs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.flair {
		display: inline-block;
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
	.flair.spoiler {
		background: var(--md-sys-color-surface-container-highest);
	}
	.preview {
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		background: var(--md-sys-color-surface-container-low);
	}
	.preview img {
		display: block;
		width: 100%;
		height: auto;
		/* Uniform cap so a tall/portrait thumbnail doesn't dominate the feed —
		   landscape media stays its natural (shorter) height; taller media is
		   cropped to this height so cards scan consistently. */
		max-height: 42vh;
		object-fit: cover;
		object-position: top;
	}
	.preview.blur img {
		filter: blur(36px);
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
		font-size: 13px;
		z-index: 2;
	}
	.play {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
	}
	.badge-corner {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		border-radius: 12px;
		font-size: 12px;
	}
	.selftext {
		margin: 0;
		font-size: calc(13px * var(--font-scale));
		color: var(--md-sys-color-on-surface-variant);
		white-space: pre-wrap;
		max-height: 8em;
		overflow: hidden;
	}
	.linkbar {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 8px;
		background: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-on-surface-variant);
		font-size: 12px;
		max-width: fit-content;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 16px;
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
		padding: 6px;
		border-radius: 16px;
	}
	.btn:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.btn.active {
		color: var(--md-sys-color-primary);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		color: var(--md-sys-color-primary);
	}
</style>
