<script lang="ts">
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import { onDestroy, untrack } from 'svelte';
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
	import { getFeedContext } from '$lib/stores/history';
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

	// Monotonic token + a destroyed flag so a slow load that resolves after the
	// user has already gone back can't scroll the *feed* to the top — that was
	// silently undoing the feed's own scroll restoration on a fast back-press.
	let loadGen = 0;
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
		loadGen++;
	});

	async function load() {
		if (!id) return;
		const gen = ++loadGen;
		loading = true;
		error = null;
		try {
			const r = await getSubmissionComments(id, { sort });
			if (gen !== loadGen || destroyed) return;
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			post = r.data.post;
			comments = r.data.comments;
			if ($prefs.markPostsRead) readPosts.mark(id);
			window.scrollTo({ top: 0 });
		} catch (e) {
			if (gen !== loadGen || destroyed) return;
			console.error('post detail load failed', id, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	$effect(() => {
		id;
		sort;
		untrack(() => load());
	});

	function navigate(direction: 'prev' | 'next') {
		const ctx = getFeedContext();
		if (!ctx?.feedItemIds.length) return;
		const idx = ctx.feedItemIds.indexOf(id);
		if (idx === -1) return;
		const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
		const targetId = ctx.feedItemIds[targetIdx];
		// replaceState, NOT a push: swiping between posts is moving *within* one
		// "reading a post" step, not descending deeper. With a push, swiping
		// through five posts stacked five history entries and the back button
		// walked them one at a time instead of returning to the feed.
		if (targetId) goto(`/comments/${targetId}`, { replaceState: true });
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
	<ErrorState message={error} onRetry={load} />
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
	.blocked {
		padding: 48px 24px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.blocked-title {
		font-size: var(--type-title);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface);
		margin-bottom: 6px;
	}
	.blocked-sub {
		font-size: var(--type-secondary);
		line-height: 1.5;
	}
</style>
