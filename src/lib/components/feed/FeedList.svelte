<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import PostCard from './PostCard.svelte';
	import PostCompact from './PostCompact.svelte';
	import PostGallery from './PostGallery.svelte';
	import FeedSkeleton from './FeedSkeleton.svelte';
	import PullIndicator from '$lib/components/shared/PullIndicator.svelte';
	import { hidden } from '$lib/stores/hidden';
	import { prefs } from '$lib/stores/prefs';
	import { setFeedContext } from '$lib/stores/history';
	import { pullToRefresh, type PullToRefreshState } from '$lib/actions/pullToRefresh';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		posts: Post[];
		loading?: boolean;
		hasMore?: boolean;
		feedKey?: { sort?: string; subreddit?: string; after?: string | null };
		onLoadMore?: () => void;
		onRefresh?: () => Promise<void> | void;
	}

	let {
		posts,
		loading = false,
		hasMore = false,
		feedKey,
		onLoadMore,
		onRefresh
	}: Props = $props();

	let visible = $derived(
		posts.filter((p) => !$hidden.has(p.id) && (!p.over18 || $prefs.showNsfw || $prefs.blurNsfw))
	);

	let sentinel: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | undefined;

	let pullDistance = $state(0);
	let refreshing = $state(false);

	function onPullState(s: PullToRefreshState) {
		pullDistance = s.distance;
		refreshing = s.refreshing;
	}

	// Show skeletons during the first load when nothing is on screen yet.
	// If the network drags past 5s, fall back to the plain "Loading…" text so
	// the user doesn't sit watching a shimmer forever.
	let skeletonStale = $state(false);
	let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (loading && visible.length === 0) {
			skeletonStale = false;
			if (skeletonTimer) clearTimeout(skeletonTimer);
			skeletonTimer = setTimeout(() => (skeletonStale = true), 5000);
		} else {
			if (skeletonTimer) {
				clearTimeout(skeletonTimer);
				skeletonTimer = null;
			}
			skeletonStale = false;
		}
	});
	let showSkeletons = $derived(
		loading && !refreshing && visible.length === 0 && !skeletonStale && $prefs.layout === 'card'
	);

	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting && hasMore && !loading && onLoadMore) onLoadMore();
				}
			},
			{ rootMargin: '600px 0px' }
		);
		if (sentinel) observer.observe(sentinel);
	});

	onDestroy(() => observer?.disconnect());

	function recordContext(post: Post) {
		setFeedContext({
			feedItemIds: visible.map((p) => p.id),
			after: feedKey?.after,
			sort: feedKey?.sort,
			subreddit: feedKey?.subreddit
		});
	}
</script>

<div class="ptr" use:pullToRefresh={{ onRefresh: onRefresh ?? (() => {}), onState: onPullState }}>
	<PullIndicator distance={pullDistance} {refreshing} />

	{#if showSkeletons}
		<FeedSkeleton count={4} />
	{:else}
		<div class="list" data-layout={$prefs.layout}>
			{#each visible as post (post.id)}
				{#if $prefs.layout === 'card'}
					<PostCard {post} onOpen={() => { recordContext(post); goto(`/comments/${post.id}`); }} />
				{:else if $prefs.layout === 'compact'}
					<PostCompact {post} onOpen={() => { recordContext(post); goto(`/comments/${post.id}`); }} />
				{:else}
					<PostGallery {post} onOpen={() => { recordContext(post); goto(`/comments/${post.id}`); }} />
				{/if}
			{/each}

			{#if loading && !refreshing}
				<div class="status">Loading…</div>
			{/if}
			{#if !loading && !refreshing && visible.length === 0}
				<div class="status empty">No posts.</div>
			{/if}

			<div bind:this={sentinel} class="sentinel" aria-hidden="true"></div>
		</div>
	{/if}
</div>

<style>
	.ptr {
		position: relative;
		overscroll-behavior-y: contain;
		touch-action: pan-y;
	}
	.list[data-layout='card'] {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}
	.list[data-layout='compact'] {
		display: flex;
		flex-direction: column;
	}
	.list[data-layout='gallery'] {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 4px;
		padding: 4px;
	}
	.status {
		padding: 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
		font-size: 13px;
	}
	.empty {
		padding: 48px 16px;
	}
	.sentinel {
		height: 1px;
	}
</style>
