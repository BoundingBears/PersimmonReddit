<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostDetail from '$lib/components/post/PostDetail.svelte';
	import CommentTree from '$lib/components/comments/CommentTree.svelte';
	import PullIndicator from '$lib/components/shared/PullIndicator.svelte';
	import { getSubmissionComments } from '$lib/reddit/endpoints';
	import { prefs } from '$lib/stores/prefs';
	import { peekEntry } from '$lib/stores/history';
	import { swipeNav } from '$lib/utils/swipeNav';
	import { pullToRefresh, type PullToRefreshState } from '$lib/actions/pullToRefresh';
	import type { CommentNode, CommentSort, Post } from '$lib/reddit/types';

	let id = $derived($page.params.id ?? '');

	let post = $state<Post | null>(null);
	let comments = $state<CommentNode[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let sort = $state<CommentSort>($prefs.defaultCommentSort);

	const sortOptions: CommentSort[] = ['best', 'top', 'new', 'controversial', 'old', 'qa'];

	async function load() {
		if (!id) return;
		loading = true;
		error = null;
		try {
			const r = await getSubmissionComments(id, { sort });
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			post = r.data.post;
			comments = r.data.comments;
			window.scrollTo({ top: 0 });
		} catch (e) {
			console.error('post detail load failed', id, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		id;
		sort;
		untrack(() => load());
	});

	function navigate(direction: 'prev' | 'next') {
		const entry = peekEntry();
		if (!entry?.feedItemIds) return;
		const idx = entry.feedItemIds.indexOf(id);
		if (idx === -1) return;
		const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
		const targetId = entry.feedItemIds[targetIdx];
		if (targetId) goto(`/comments/${targetId}`);
	}

	let pullDistance = $state(0);
	let refreshing = $state(false);
	function onPullState(s: PullToRefreshState) {
		pullDistance = s.distance;
		refreshing = s.refreshing;
	}
</script>

<TopAppBar
	title={post ? `r/${post.subreddit}` : 'Loading…'}
	titleHref={post ? `/r/${post.subreddit}` : undefined}
	subtitle={post ? `${post.numComments} comments` : ''}
	showBack
>
	{#snippet actions()}
		<select class="sort" bind:value={sort} aria-label="Comment sort">
			{#each sortOptions as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	{/snippet}
</TopAppBar>

{#if error}
	<div class="error">
		{error} <button onclick={load}>Retry</button>
	</div>
{/if}

<div
	class="ptr"
	use:swipeNav={{ onPrev: () => navigate('prev'), onNext: () => navigate('next') }}
	use:pullToRefresh={{ onRefresh: load, onState: onPullState }}
>
	<PullIndicator distance={pullDistance} {refreshing} />
	{#if post}
		<PostDetail {post} />
		<CommentTree bind:comments linkFullId={post.fullId} opAuthor={post.author} />
	{:else if loading}
		<div class="status">Loading post…</div>
	{/if}
</div>

<style>
	.ptr {
		position: relative;
		overscroll-behavior-y: contain;
		touch-action: pan-y;
	}
	.sort {
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 8px;
		padding: 4px 8px;
		font: inherit;
	}
	.status {
		padding: 32px 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.error {
		padding: 12px 16px;
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.error button {
		margin-left: 8px;
		background: var(--md-sys-color-on-error);
		color: var(--md-sys-color-error);
		padding: 4px 10px;
		border-radius: 4px;
	}
</style>
