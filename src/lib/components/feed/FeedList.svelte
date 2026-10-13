<script lang="ts">
	import { blockedUsers, isBlocked } from '$lib/stores/blockedUsers';
	import { tick, untrack } from 'svelte';
	import { openPost } from '$lib/stores/postLayer';
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
	import { pullToRefresh, type PullToRefreshState } from '$lib/actions/pullToRefresh';
	import type { Post } from '$lib/reddit/types';

	interface Props {
		posts: Post[];
		loading?: boolean;
		hasMore?: boolean;
		// Apply the user's content filters (keyword/subreddit/domain). On for
		// every feed that mixes subreddits, off inside a single subreddit the
		// user opened on purpose. See isMixedFeed in filters.ts.
		applyFilters?: boolean;
		// Set when these posts came from the persistent cache (live fetch failed).
		staleAt?: number | null;
		// A merged feed that is short some of its subreddits (endpoints.ts).
		missing?: { failed: number; total: number; refused: boolean };
		// Last fetch error message. With posts already shown it means a
		// load-more failed (e.g. flaky deep page) — surfaced as a bottom retry.
		error?: string | null;
		onLoadMore?: () => void;
		onRefresh?: () => Promise<void> | void;
		// When the feed is being rebuilt from a snapshot: the post the user was
		// looking at. Cards around it are mounted first, see the render window.
		anchorId?: string;
	}

	let {
		posts,
		loading = false,
		hasMore = false,
		applyFilters = false,
		staleAt = null,
		missing,
		error = null,
		onLoadMore,
		onRefresh,
		anchorId
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
			// Blocked authors go regardless of applyFilters — a block means everywhere.
			if (isBlocked($blockedUsers, p.author)) return false;
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

	// The render window: which slice of `visible` is actually mounted. It always
	// grows to cover everything, a few cards per frame, so the main thread is
	// never blocked for long.
	//
	//   - Fresh load: a screenful first, then the rest top to bottom, instead
	//     of all 25 cards laying out in one janky frame.
	//   - Back from a post (posts already here): the cards AROUND the post the
	//     user was looking at first, then outwards in both directions. This
	//     used to mount every card before anything could respond, which
	//     measured 1.9 s of frozen main thread for 50 posts and grew with every
	//     page scrolled. Position is restored by aligning the anchor post
	//     (scrollRestore.ts), so it does not need the cards above it to exist.
	const INITIAL_RENDER = 8;
	const RENDER_STEP = 6;
	const WINDOW_ABOVE = 3;
	const WINDOW_BELOW = 6;
	const initial = untrack(() => {
		if (posts.length === 0) return { start: 0, end: INITIAL_RENDER };
		const at = anchorId ? visible.findIndex((p) => p.id === anchorId) : -1;
		// No anchor to centre on: mount everything, as before.
		if (at < 0) return { start: 0, end: visible.length };
		return { start: Math.max(0, at - WINDOW_ABOVE), end: Math.min(visible.length, at + WINDOW_BELOW + 1) };
	});
	let start = $state(initial.start);
	let end = $state(initial.end);
	let listEl: HTMLDivElement | undefined = $state();
	let growAboveNext = false;

	// Mounting cards above the viewport pushes everything down. Put the view
	// back by however far the first already-mounted card moved.
	async function growAbove() {
		const ref = listEl?.querySelector<HTMLElement>('[data-post-id]');
		const before = ref?.getBoundingClientRect().top;
		start = Math.max(0, start - RENDER_STEP);
		await tick();
		if (!ref || before === undefined || !ref.isConnected) return;
		const moved = ref.getBoundingClientRect().top - before;
		if (Math.abs(moved) > 0.5) window.scrollBy({ top: moved, behavior: 'instant' as ScrollBehavior });
	}

	$effect(() => {
		const n = visible.length;
		if (n === 0) {
			// reset for the next fresh fill
			start = 0;
			end = INITIAL_RENDER;
			return;
		}
		const below = end < n;
		const above = start > 0;
		// Not while refreshing: those cards are about to be replaced.
		if ((!below && !above) || refreshing) return;
		const id = requestAnimationFrame(() => {
			// Alternate sides so neither direction of scroll runs into a gap.
			if (above && (growAboveNext || !below)) {
				growAboveNext = false;
				void growAbove();
			} else {
				growAboveNext = true;
				end = Math.min(end + RENDER_STEP, n);
			}
		});
		return () => cancelAnimationFrame(id);
	});
	let shown = $derived(visible.slice(start, end));

	// Boot milestone: the first time any feed has posts on screen.
	let markedFirstPosts = false;
	$effect(() => {
		if (!markedFirstPosts && shown.length > 0) {
			markedFirstPosts = true;
			if (performance.getEntriesByName('persimmon:first-posts').length === 0) {
				performance.mark('persimmon:first-posts');
			}
		}
	});

	let sentinel: HTMLDivElement | undefined = $state();

	let pullDistance = $state(0);
	let refreshing = $state(false);

	function onPullState(s: PullToRefreshState) {
		pullDistance = s.distance;
		if (s.refreshing && !refreshing) {
			// The old posts stay on screen during a refresh. Cut them back to a
			// screenful so the fresh list fills in a few cards per frame like a
			// first load, instead of every new card mounting in one frame.
			start = 0;
			end = INITIAL_RENDER;
		}
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
		// or before the progressive render has caught up. And not after a
		// failure: `loading` going back to false re-runs this effect, so a
		// failed page was asked for again at once, and again, for as long as
		// the end of the list stayed on screen. The list sat on "Loading…" and
		// Reddit got the same refused request several times a second. After a
		// failure the next attempt is the user's, with the Retry button.
		if (
			sentinelVisible &&
			hasMore &&
			!loading &&
			!error &&
			onLoadMore &&
			visible.length > 0 &&
			end >= visible.length
		) {
			onLoadMore();
		}
	});
</script>

<div class="ptr" use:pullToRefresh={{ onRefresh: onRefresh ?? (() => {}), onState: onPullState }}>
	<PullIndicator distance={pullDistance} {refreshing} />

	{#if staleAt}
		<div class="stale-banner">
			<Icon name="cloud_off" size={16} />
			<span>Showing cached posts: couldn't reach Reddit. Pull to refresh.</span>
		</div>
	{/if}
	{#if missing && visible.length > 0}
		<div class="stale-banner">
			<Icon name="cloud_off" size={16} />
			<span>
				{missing.failed} of your {missing.total} subreddits didn't load{missing.refused
					? ': Reddit refused them.'
					: '.'}
			</span>
		</div>
	{/if}

	{#if showSkeletons}
		<FeedSkeleton count={4} layout={$prefs.layout} />
	{:else}
		<div class="list" data-layout={$prefs.layout} bind:this={listEl}>
			{#each shown as post (post.id)}
				{#if $prefs.layout === 'card'}
					<PostCard {post} onOpen={() => openPost(post.id, post)} />
				{:else if $prefs.layout === 'compact'}
					<PostCompact {post} onOpen={() => openPost(post.id, post)} />
				{:else}
					<PostGallery {post} onOpen={() => openPost(post.id, post)} />
				{/if}
			{/each}

			{#if loading && !refreshing}
				<div class="status">Loading…</div>
			{:else if !refreshing && error && visible.length > 0}
				<div class="status load-error">
					<span>Couldn't load more posts.</span>
					<span class="why">{error}</span>
					<button class="retry" onclick={() => onLoadMore?.()}>Retry</button>
				</div>
			{:else if !refreshing && visible.length === 0 && error}
				<!-- The page says what went wrong (ErrorState); "No posts" would be untrue. -->
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
		font-size: var(--type-secondary);
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
	.load-error .why {
		margin-top: -6px;
		max-width: 34ch;
		font-size: var(--type-meta);
		line-height: 1.4;
	}
	.retry {
		padding: 8px 18px;
		border-radius: 20px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
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
		font-size: var(--type-body-lg);
		font-weight: var(--weight-heading);
		color: var(--md-sys-color-on-surface);
	}
	.caught-sub {
		font-size: var(--type-secondary);
	}
	.reveal {
		margin-top: 10px;
		padding: 8px 16px;
		border-radius: 20px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
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
		font-size: var(--type-meta);
	}
</style>
