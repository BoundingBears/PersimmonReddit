<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostDetail from '$lib/components/post/PostDetail.svelte';
	import PostSkeleton from '$lib/components/post/PostSkeleton.svelte';
	import CommentTree from '$lib/components/comments/CommentTree.svelte';
	import PullIndicator from '$lib/components/shared/PullIndicator.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { getSubmissionComments } from '$lib/reddit/endpoints';
	import { prefs } from '$lib/stores/prefs';
	import { readPosts } from '$lib/stores/readPosts';
	import { IS_IOS } from '$lib/utils/platform';
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
			if ($prefs.markPostsRead) readPosts.mark(id);
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

	// On iOS we never render NSFW posts (no toggle to override). Direct
	// links to over18 posts (URL paste, search results) hit a placeholder
	// instead of the post / comments / media.
	let blockedNsfw = $derived(IS_IOS && !!post?.over18);
</script>

<TopAppBar
	title={post ? `r/${post.subreddit}` : 'Loading…'}
	titleHref={post ? `/r/${post.subreddit}` : undefined}
	dense
	showBack
>
	{#snippet actions()}
		<Dropdown bind:value={sort} options={sortOptions} label="Comment sort" />
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
	{#if post && blockedNsfw}
		<div class="blocked">
			<div class="blocked-title">Adult content</div>
			<div class="blocked-sub">
				This post is marked NSFW and isn't available in this app.
			</div>
		</div>
	{:else if post}
		<PostDetail {post} />
		<CommentTree bind:comments linkFullId={post.fullId} opAuthor={post.author} />
	{:else if loading}
		<PostSkeleton />
	{/if}
</div>

<style>
	.ptr {
		position: relative;
		overscroll-behavior-y: contain;
		touch-action: pan-y;
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
	.blocked {
		padding: 48px 24px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.blocked-title {
		font-size: 16px;
		font-weight: 500;
		color: var(--md-sys-color-on-surface);
		margin-bottom: 6px;
	}
	.blocked-sub {
		font-size: 13px;
		line-height: 1.5;
	}
</style>
