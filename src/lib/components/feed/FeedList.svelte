<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import PostCard from './PostCard.svelte';
	import PostCompact from './PostCompact.svelte';
	import PostGallery from './PostGallery.svelte';
	import FeedSkeleton from './FeedSkeleton.svelte';
	import PullIndicator from '$lib/components/shared/PullIndicator.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { hidden } from '$lib/stores/hidden';
	import { prefs } from '$lib/stores/prefs';
	import { readPosts } from '$lib/stores/readPosts';
	import { filters, postMatchesFilters } from '$lib/stores/filters';
	import { IS_IOS } from '$lib/utils/platform';
	import { setFeedContext } from '$lib/stores/history';
	import { pullToRefresh, type PullToRefreshState } from '$lib/actions/pullToRefresh';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		posts: Post[];
		loading?: boolean;
		hasMore?: boolean;
		feedKey?: { sort?: string; subreddit?: string; after?: string | null };
		// Apply the user's content filters (keyword/subreddit/domain). Only the
		// merged subscribed feed opts in — browsing a specific sub or the front
		// page shouldn't silently drop posts.
		applyFilters?: boolean;
		// Set when these posts came from the persistent cache (live fetch failed).
		staleAt?: number | null;
		// Last fetch error message. With posts already shown it means a
		// load-more failed (e.g. flaky deep page) — surfaced as a bottom retry.
		error?: string | null;
		onLoadMore?: () => void;
		onRefresh?: () => Promise<void> | void;
	}

	let {
		posts,
		loading = false,
		hasMore = false,
		feedKey,
		applyFilters = false,
		staleAt = null,
		error = null,
		onLoadMore,
		onRefresh
	}: Props = $props();

	// On iOS, NSFW posts are dropped entirely regardless of any pref — App
	// Store policy doesn't allow a user-toggle for adult content. On Android
	// and web the toggle controls visibility (showNsfw=show, blurNsfw=show
	// blurred, neither=hide).
	// "Show read posts" override for this feed view, used to escape the
	// all-caught-up state without changing the global pref.
	let revealRead = $state(false);
	let readHideActive = $derived($prefs.markPostsRead && $prefs.hideReadPosts && !revealRead);

	// Canonical filter pipeline (hidden → filters → nsfw), with the read-hide
	// clause kept as a separate final pass so we can tell when read-hiding ALONE
	// emptied the feed (→ "all caught up") instead of auto-paginating forever.
	let baseVisible = $derived(
		posts.filter((p) => {
			if ($hidden.has(p.id)) return false;
			if (applyFilters && postMatchesFilters(p, $filters)) return false;
			if (!p.over18) return true;
			if (IS_IOS) return false;
			return $prefs.showNsfw || $prefs.blurNsfw;
		})
	);
	let visible = $derived(
		readHideActive ? baseVisible.filter((p) => !$readPosts.has(p.id)) : baseVisible
	);
	// Read-hiding (and nothing else) is what left the feed empty.
	let caughtUp = $derived(readHideActive && baseVisible.length > 0 && visible.length === 0);

	// Progressive render — paint a screenful immediately, then stream the rest
	// in over a few frames so a freshly-loaded page populates top-to-bottom
	// instead of all 25 cards laying out in one janky frame. Seed to the full
	// count when posts already exist at mount (back-nav snapshot) so scroll
	// restoration has the real page height to land on.
	const INITIAL_RENDER = 8;
	const RENDER_STEP = 6;
	let renderLimit = $state(untrack(() => (posts.length > 0 ? posts.length : INITIAL_RENDER)));
	$effect(() => {
		if (visible.length === 0) {
			renderLimit = INITIAL_RENDER; // reset for the next fresh fill
			return;
		}
		if (renderLimit >= visible.length) return;
		const id = requestAnimationFrame(() => {
			renderLimit = Math.min(renderLimit + RENDER_STEP, visible.length);
		});
		return () => cancelAnimationFrame(id);
	});
	let shown = $derived(visible.slice(0, renderLimit));

	let sentinel: HTMLDivElement | undefined = $state();

	let pullDistance = $state(0);
	let refreshing = $state(false);

	function onPullState(s: PullToRefreshState) {
		pullDistance = s.distance;
		refreshing = s.refreshing;
	}

	// Show skeletons during the first load when nothing is on screen yet.
	// If the network drags way past a slow-but-working load, fall back to the
	// plain "Loading…" text so the user doesn't sit watching a shimmer forever.
	// Generous (15s) so a genuinely slow connection still gets the nicer
	// skeletons rather than dropping to bare text after a few seconds.
	let skeletonStale = $state(false);
	let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (loading && visible.length === 0) {
			skeletonStale = false;
			if (skeletonTimer) clearTimeout(skeletonTimer);
			skeletonTimer = setTimeout(() => (skeletonStale = true), 15000);
		} else {
			if (skeletonTimer) {
				clearTimeout(skeletonTimer);
				skeletonTimer = null;
			}
			skeletonStale = false;
		}
	});
	let showSkeletons = $derived(
		loading && !refreshing && visible.length === 0 && !skeletonStale
	);

	// Attach the infinite-scroll observer reactively. The sentinel only enters
	// the DOM once the real list (not the skeletons) renders, and it's recreated
	// whenever we flip back to skeletons — a one-shot onMount attach misses it,
	// which silently kills pagination after the first cold load.
	//
	// The observer is LEVEL-triggered, not edge-triggered: it just tracks whether
	// the sentinel is on-screen, and a separate $effect decides whether to load.
	// Edge-triggering (calling onLoadMore straight from the callback) silently
	// stalled when an appended page added no height below the sentinel — e.g. a
	// whole page removed by the keyword/NSFW/read filters — because the sentinel
	// never *exited* the root margin to re-fire. The effect re-runs whenever
	// `loading` flips back to false, so it keeps pulling pages until a visible
	// one lands or the feed genuinely ends.
	let sentinelVisible = $state(false);
	$effect(() => {
		const el = sentinel;
		if (!el || typeof IntersectionObserver === 'undefined') return;
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) sentinelVisible = e.isIntersecting;
			},
			{ rootMargin: '600px 0px' }
		);
		obs.observe(el);
		return () => {
			obs.disconnect();
			sentinelVisible = false;
		};
	});
	$effect(() => {
		// Don't paginate on an empty list (an all-read page would loop forever)
		// or before the progressive render has caught up.
		if (
			sentinelVisible &&
			hasMore &&
			!loading &&
			onLoadMore &&
			visible.length > 0 &&
			renderLimit >= visible.length
		) {
			onLoadMore();
		}
	});

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

	{#if staleAt}
		<div class="stale-banner">
			<Icon name="cloud_off" size={16} />
			<span>Showing cached posts — couldn't reach Reddit. Pull to refresh.</span>
		</div>
	{/if}

	{#if showSkeletons}
		<FeedSkeleton count={4} layout={$prefs.layout} />
	{:else}
		<div class="list" data-layout={$prefs.layout}>
			{#each shown as post (post.id)}
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
			{:else if !refreshing && error && visible.length > 0}
				<div class="status load-error">
					<span>Couldn't load more posts.</span>
					<button class="retry" onclick={() => onLoadMore?.()}>Retry</button>
				</div>
			{:else if !refreshing && visible.length === 0}
				{#if caughtUp}
					<div class="status empty caught-up">
						<div class="caught-title">You're all caught up</div>
						<div class="caught-sub">Every post here is one you've already opened.</div>
						<button class="reveal" onclick={() => (revealRead = true)}>Show read posts</button>
					</div>
				{:else}
					<div class="status empty">No posts.</div>
				{/if}
			{:else if !refreshing && !hasMore && visible.length > 0}
				<!-- Reddit stops handing out a cursor after a finite depth (sooner for
				     logged-out r/all & r/popular) — make the genuine end explicit so it
				     doesn't read as a freeze. -->
				<div class="status end">You've reached the end of this feed.</div>
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
	.end {
		padding: 20px 16px 28px;
		color: var(--md-sys-color-outline);
	}
	.load-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 20px 16px 28px;
	}
	.retry {
		padding: 8px 18px;
		border-radius: 20px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
	}
	.empty {
		padding: 48px 16px;
	}
	.caught-up {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.caught-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--md-sys-color-on-surface);
	}
	.caught-sub {
		font-size: 13px;
	}
	.reveal {
		margin-top: 10px;
		padding: 8px 16px;
		border-radius: 20px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
	}
	.sentinel {
		height: 1px;
	}
	.stale-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px;
		padding: 8px 12px;
		border-radius: 8px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		font-size: 12px;
	}
</style>
