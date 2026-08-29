<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { getSubmissions, getMergedSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { prefs, type HomeView } from '$lib/stores/prefs';
	import { subscribed } from '$lib/stores/subscribed';
	import { getFeedSnapshot, saveFeedSnapshot } from '$lib/stores/feedSnapshot';
	import { captureScrollAnchor, restoreScrollAnchor } from '$lib/utils/scrollRestore';
	import type { Listing, Post, Sort } from '$lib/reddit/types';

	let staleAt = $state<number | null>(null);

	const SNAPSHOT_KEY = 'home';

	// Hydrate from cached snapshot if we have one (back-navigation case).
	const snap = getFeedSnapshot(SNAPSHOT_KEY);
	let posts = $state<Post[]>(snap?.posts ?? []);
	let after = $state<string | null>(snap?.after ?? null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let restored = $state(!!snap);
	let scrollRestored = $state(false);
	let prefsReady = $state(false);

	// Single source of truth for the dropdown is $prefs.homeView. Snapshot's
	// `sort` field tracks whatever the user had selected last visit so we
	// re-render the right cached posts on back-nav.
	const homeViewOptions: ReadonlyArray<{ value: HomeView; label: string }> = [
		{ value: 'hot', label: 'hot' },
		{ value: 'new', label: 'new' },
		{ value: 'top', label: 'top' },
		{ value: 'rising', label: 'rising' },
		{ value: 'subscribed', label: 'subscribed' }
	];

	onMount(async () => {
		await prefs.ready;
		prefsReady = true;
	});

	// Monotonic token so a forced reload (pull-to-refresh, retry) can supersede
	// a slow/hung in-flight load: the stale request's results are discarded when
	// its `gen` no longer matches, and only the newest load owns the `loading`
	// flag. Without this, `if (loading) return` made every recovery path a no-op
	// whenever a request wedged.
	let loadGen = 0;

	async function load(reset = false, force = false) {
		if (loading && !force) return;
		const gen = ++loadGen;
		const v = $prefs.homeView;
		loading = true;
		error = null;
		try {
			let listing: Listing<Post> | null = null;
			let stale: number | null = null;
			if (v === 'subscribed') {
				const subs = $subscribed.map((s) => s.name);
				if (subs.length === 0) {
					if (gen === loadGen) {
						posts = [];
						after = null;
					}
					return;
				}
				const r = await getMergedSubmissions(subs, 'hot', { limitPerSub: 25 });
				if (gen !== loadGen) return;
				if (!r.ok) {
					error = r.error.message;
					return;
				}
				listing = r.data;
				stale = r.meta?.staleAt ?? null;
			} else {
				const r = await getSubmissions(
					v as Sort,
					undefined,
					reset ? undefined : { after: after ?? undefined }
				);
				if (gen !== loadGen) return;
				if (!r.ok) {
					error = r.error.message;
					return;
				}
				listing = r.data;
				stale = r.meta?.staleAt ?? null;
			}
			staleAt = stale;
			if (reset) {
				posts = listing.items;
			} else {
				// Reddit re-ranks listings between page fetches, so a later page
				// routinely repeats a post already shown — dedupe by id or the
				// keyed {#each} collides on duplicate keys.
				const seen = new Set(posts.map((p) => p.id));
				posts = [...posts, ...listing.items.filter((p) => !seen.has(p.id))];
			}
			after = listing.after;
		} catch (e) {
			if (gen !== loadGen) return;
			console.error('home load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	// Read the two things the reload effect actually depends on through $derived
	// so it re-runs on a *value* change, not on any store write.
	//
	// `$prefs` is a plain writable holding one big object, so reading
	// `$prefs.homeView` directly inside the effect subscribed it to every
	// preference: dismissing the update banner, closing the What's New sheet, or
	// the once-a-day checkForUpdates() stamping `lastUpdateCheck` all re-ran the
	// effect, which wipes `posts` and refetches — dumping the user back at the
	// top of a fresh feed mid-scroll. Same for `$subscribed`, whose array
	// identity changes on any write to that store.
	let homeView = $derived($prefs.homeView);
	// Tracked so that if the subscribed store hydrates from preferences AFTER
	// the first effect run, we reload rather than leaving posts=[] forever (the
	// empty-subs early-return in load()) until the app is fully restarted.
	let subsKey = $derived(
		$prefs.homeView === 'subscribed' ? $subscribed.map((s) => s.name).join(',') : ''
	);

	$effect(() => {
		// Gate first load on prefs hydration so we don't fetch front-page-hot
		// briefly before switching to the user's persisted preference.
		if (!prefsReady) return;
		homeView;
		subsKey;
		untrack(() => {
			if (restored) {
				restored = false;
				return;
			}
			posts = [];
			after = null;
			load(true);
		});
	});

	// Refresh when the app comes back from a long background — Reddit
	// session cookies can lapse, network state may have flipped, and stale
	// stores may have been re-hydrated mid-effect.
	onMount(() => {
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			if (loading) return;
			// Only auto-refresh when we have nothing to show; don't blow away
			// posts the user is currently scrolling through.
			if (posts.length === 0) load(true);
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	// Restore by anchor post rather than raw offset — the page settles at a
	// slightly different height than we left it (lazy images, the stale banner,
	// a just-read post dropped by the hide-read filter), and a raw offset lands
	// on a different post every time. See scrollRestore.ts.
	let cancelRestore: (() => void) | null = null;
	afterNavigate(() => {
		if (scrollRestored || !snap) return;
		scrollRestored = true;
		cancelRestore = restoreScrollAnchor(snap);
	});
	onDestroy(() => cancelRestore?.());

	// IMPORTANT: capture scroll in beforeNavigate, NOT onDestroy.
	// onDestroy fires AFTER the component's DOM is removed, at which point
	// the document height has collapsed and the browser has already clamped
	// window.scrollY to 0 — so a save here would always store 0.
	// beforeNavigate runs while the page is still mounted and scrolled.
	beforeNavigate(() => {
		if (typeof window === 'undefined' || posts.length === 0) return;
		cancelRestore?.();
		saveFeedSnapshot(SNAPSHOT_KEY, {
			posts,
			after,
			sort: $prefs.homeView,
			...captureScrollAnchor()
		});
	});

	async function refresh() {
		clearCache();
		posts = [];
		after = null;
		await load(true, true);
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}

	let subtitle = $derived(
		$prefs.homeView === 'subscribed'
			? `Subscribed · ${$subscribed.length} subs`
			: `Front page · ${$prefs.homeView}`
	);
</script>

<TopAppBar title="Persimmon" {subtitle}>
	{#snippet actions()}
		<Dropdown bind:value={$prefs.homeView} options={homeViewOptions} label="Feed" />
		<a href="/settings" class="iconbtn" aria-label="Settings"><Icon name="settings" size={22} /></a>
	{/snippet}
</TopAppBar>

{#if error}
	<div class="error">
		Couldn't reach Reddit ({error}).
		<button onclick={() => load(true)}>Retry</button>
	</div>
{/if}

{#if $prefs.homeView === 'subscribed' && $subscribed.length === 0}
	<div class="empty">
		<p>You haven't subscribed to anything yet.</p>
		<p>Bookmark subreddits from the Subs tab or any subreddit page; they'll show up here.</p>
		<a class="cta" href="/subreddits">Discover subreddits</a>
	</div>
{:else}
	<FeedList
		{posts}
		{loading}
		hasMore={after !== null}
		feedKey={{ sort: $prefs.homeView, after }}
		applyFilters={$prefs.homeView === 'subscribed'}
		{staleAt}
		{error}
		onLoadMore={() => load(false)}
		onRefresh={refresh}
	/>
{/if}

<style>
	.iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--md-sys-color-on-surface);
	}
	.iconbtn:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.empty {
		padding: 48px 24px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.empty p {
		margin: 0 0 12px;
	}
	.cta {
		display: inline-block;
		margin-top: 12px;
		padding: 10px 20px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		border-radius: 24px;
		font-weight: 500;
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
		font-weight: 500;
	}
</style>
