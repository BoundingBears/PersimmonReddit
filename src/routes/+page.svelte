<script lang="ts">
	import { onMount, untrack } from 'svelte';
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
	import type { Listing, Post, Sort } from '$lib/reddit/types';

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

	async function load(reset = false) {
		if (loading) return;
		const v = $prefs.homeView;
		loading = true;
		error = null;
		try {
			let listing: Listing<Post> | null = null;
			if (v === 'subscribed') {
				const subs = $subscribed.map((s) => s.name);
				if (subs.length === 0) {
					posts = [];
					after = null;
					return;
				}
				const r = await getMergedSubmissions(subs, 'hot', { limitPerSub: 25 });
				if (!r.ok) {
					error = r.error.message;
					return;
				}
				listing = r.data;
			} else {
				const r = await getSubmissions(
					v as Sort,
					undefined,
					reset ? undefined : { after: after ?? undefined }
				);
				if (!r.ok) {
					error = r.error.message;
					return;
				}
				listing = r.data;
			}
			posts = reset ? listing.items : [...posts, ...listing.items];
			after = listing.after;
		} catch (e) {
			console.error('home load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// Gate first load on prefs hydration so we don't fetch front-page-hot
		// briefly before switching to the user's persisted preference.
		if (!prefsReady) return;
		$prefs.homeView; // track for changes
		// Also track $subscribed when in subscribed mode — without this, if
		// the subscribed store hydrates from preferences AFTER the first
		// effect run, the empty-subs early-return at the top of load() leaves
		// posts=[] forever and the user sees "No posts" until the app is
		// fully restarted.
		if ($prefs.homeView === 'subscribed') $subscribed;
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

	// afterNavigate runs after the route transition (including the View
	// Transitions API animation) is fully committed, so scrollTo here is
	// guaranteed to land on the laid-out new page rather than getting
	// captured into a transition snapshot at scroll=0.
	afterNavigate(() => {
		if (scrollRestored || !snap) return;
		scrollRestored = true;
		// Two rAFs to ensure the post-card list has finished its first paint.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				window.scrollTo({ top: snap.scrollY, behavior: 'instant' as ScrollBehavior });
			})
		);
	});

	// IMPORTANT: capture scroll in beforeNavigate, NOT onDestroy.
	// onDestroy fires AFTER the component's DOM is removed, at which point
	// the document height has collapsed and the browser has already clamped
	// window.scrollY to 0 — so a save here would always store 0.
	// beforeNavigate runs while the page is still mounted and scrolled.
	beforeNavigate(() => {
		if (typeof window === 'undefined' || posts.length === 0) return;
		saveFeedSnapshot(SNAPSHOT_KEY, {
			posts,
			after,
			sort: $prefs.homeView,
			scrollY: window.scrollY
		});
	});

	async function refresh() {
		clearCache();
		posts = [];
		after = null;
		await load(true);
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
