<script lang="ts">
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { getMergedSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { subscribed, subscribedReady } from '$lib/stores/subscribed';
	import { getFeedSnapshot, saveFeedSnapshot } from '$lib/stores/feedSnapshot';
	import { captureScrollAnchor, restoreScrollAnchor } from '$lib/utils/scrollRestore';
	import type { Post, Sort } from '$lib/reddit/types';

	// Hydrate from the back-nav snapshot. Without this the merged feed is
	// re-fetched from scratch on every back-navigation: a differently ordered
	// list, and — because the page is near-empty when the browser applies the
	// restored scroll offset — the offset gets clamped and the user lands
	// somewhere near the top of posts they've never seen.
	const SNAPSHOT_KEY = 'subscribed';
	const snap = getFeedSnapshot(SNAPSHOT_KEY);

	let posts = $state<Post[]>(snap?.posts ?? []);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let staleAt = $state<number | null>(null);
	let sort = $state<Sort>((snap?.sort as Sort) ?? 'hot');
	let restored = $state(!!snap);
	let scrollRestored = $state(false);

	// Gate the reload effect on the subscribed store hydrating — otherwise the
	// first run (empty store, subsKey '') consumes the one-shot `restored` flag,
	// and the run after hydration refetches and reshuffles the merged feed,
	// destroying the anchor the scroll restore was aiming at.
	let storesReady = $state(false);
	onMount(async () => {
		await subscribedReady;
		storesReady = true;
	});

	// Monotonic token so a forced reload (pull-to-refresh, retry) supersedes a
	// slow/hung in-flight load. Without it `if (loading) return` made every
	// recovery path a permanent no-op once a request wedged.
	let loadGen = 0;

	async function load(force = false) {
		if (loading && !force) return;
		const gen = ++loadGen;
		const subs = $subscribed.map((s) => s.name);
		if (subs.length === 0) {
			posts = [];
			return;
		}
		loading = true;
		error = null;
		try {
			const r = await getMergedSubmissions(subs, sort, { limitPerSub: 25 });
			if (gen !== loadGen) return;
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			posts = r.data.items;
			staleAt = r.meta?.staleAt ?? null;
		} catch (e) {
			if (gen !== loadGen) return;
			console.error('subscribed load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	// Keyed on the sub *names* rather than the store value: `$subscribed`'s array
	// identity changes on any write to that store (including metadata-only ones
	// like a refreshed icon), and every such write would wipe and refetch the
	// feed out from under the user.
	let subsKey = $derived($subscribed.map((s) => s.name).join(','));

	$effect(() => {
		if (!storesReady) return;
		// re-fetch when sort or the subscribed list changes
		sort;
		subsKey;
		untrack(() => {
			// First run after a back-navigation: we already have the posts the
			// user was looking at, so don't refetch (and reshuffle) them.
			if (restored) {
				restored = false;
				return;
			}
			load();
		});
	});

	let cancelRestore: (() => void) | null = null;
	afterNavigate(() => {
		if (scrollRestored || !snap) return;
		scrollRestored = true;
		cancelRestore = restoreScrollAnchor(snap);
	});
	onDestroy(() => cancelRestore?.());

	// beforeNavigate, not onDestroy — onDestroy runs after the DOM is gone and
	// scrollY has already been clamped to 0.
	beforeNavigate(() => {
		if (typeof window === 'undefined' || posts.length === 0) return;
		cancelRestore?.();
		saveFeedSnapshot(SNAPSHOT_KEY, { posts, after: null, sort, ...captureScrollAnchor() });
	});

	async function refresh() {
		clearCache();
		await load(true);
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}

	// Refresh on resume from background — Reddit session cookies can lapse,
	// network state may have flipped, etc. Only auto-refresh when nothing's
	// showing so we don't disrupt active scrolling.
	onMount(() => {
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			if (loading) return;
			if (posts.length === 0 && $subscribed.length > 0) load();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	const sorts: Sort[] = ['hot', 'new', 'top'];
</script>

<TopAppBar title="Subscribed" subtitle="{$subscribed.length} subs · {sort}" showBack>
	{#snippet actions()}
		<Dropdown bind:value={sort} options={sorts} label="Sort" />
	{/snippet}
</TopAppBar>

{#if $subscribed.length === 0}
	<EmptyState
		title="You haven't subscribed to anything yet"
		body="Bookmark subreddits from the Subs tab or any subreddit page; they'll show up here as a unified feed."
		actionLabel="Discover subreddits"
		actionHref="/subreddits"
	/>
{:else if error}
	<ErrorState message="Couldn't load merged feed ({error})." onRetry={() => load(true)} />
{:else}
	<FeedList {posts} {loading} hasMore={false} applyFilters {staleAt} onRefresh={refresh} />
{/if}

<style>
</style>
