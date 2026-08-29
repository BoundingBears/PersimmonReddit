<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { getMergedSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { groups } from '$lib/stores/groups';
	import { getFeedSnapshot, saveFeedSnapshot } from '$lib/stores/feedSnapshot';
	import { captureScrollAnchor, restoreScrollAnchor } from '$lib/utils/scrollRestore';
	import type { Post, Sort } from '$lib/reddit/types';

	let groupName = $derived($page.params.name ?? '');
	let group = $derived($groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase()));
	let subs = $derived(group?.subreddits ?? []);

	// Hydrate from the back-nav snapshot. Without it the merged feed is
	// re-fetched (and re-merged into a different order) on every back-nav, and
	// the restored scroll offset is clamped against a still-empty page.
	let snapshotKey = $derived(`g:${groupName.toLowerCase()}`);
	const initialSnap = getFeedSnapshot(`g:${($page.params.name ?? '').toLowerCase()}`);

	let posts = $state<Post[]>(initialSnap?.posts ?? []);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let staleAt = $state<number | null>(null);
	let sort = $state<Sort>((initialSnap?.sort as Sort) ?? 'hot');
	let restored = $state(!!initialSnap);
	let scrollRestored = $state(false);

	// Monotonic token so a forced reload (pull-to-refresh, retry) supersedes a
	// slow/hung in-flight load. Without it `if (loading) return` made every
	// recovery path a permanent no-op once a request wedged.
	let loadGen = 0;

	async function load(force = false) {
		if (loading && !force) return;
		const gen = ++loadGen;
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
			console.error('group feed load failed', groupName, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	// Keyed on the sub *names*: `subs` is a fresh array whenever the groups store
	// is written (a rename elsewhere, the persistence write-back), and tracking
	// its identity would wipe and refetch the feed out from under the user.
	let subsKey = $derived(subs.join(','));

	$effect(() => {
		// Re-fetch when sort, the group, or its sub list changes.
		sort;
		groupName;
		subsKey;
		untrack(() => {
			// First run after a back-navigation: keep the posts the user was
			// already looking at instead of reshuffling the merge.
			if (restored) {
				restored = false;
				return;
			}
			load();
		});
	});

	let cancelRestore: (() => void) | null = null;
	afterNavigate(() => {
		if (scrollRestored || !initialSnap) return;
		scrollRestored = true;
		cancelRestore = restoreScrollAnchor(initialSnap);
	});
	onDestroy(() => cancelRestore?.());

	// beforeNavigate, not onDestroy — onDestroy runs after the DOM is gone and
	// scrollY has already been clamped to 0.
	beforeNavigate(() => {
		if (typeof window === 'undefined' || posts.length === 0) return;
		cancelRestore?.();
		saveFeedSnapshot(snapshotKey, { posts, after: null, sort, ...captureScrollAnchor() });
	});

	async function refresh() {
		clearCache();
		await load(true);
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}

	const sorts: Sort[] = ['hot', 'new', 'top'];
</script>

<TopAppBar title={group ? group.name : 'Group'} subtitle="{subs.length} subs · {sort}" showBack>
	{#snippet actions()}
		{#if group}
			<Dropdown bind:value={sort} options={sorts} label="Sort" />
		{/if}
	{/snippet}
</TopAppBar>

{#if !group}
	<div class="empty">
		<p>This group doesn't exist (it may have been deleted or renamed).</p>
		<a class="cta" href="/settings">Manage groups</a>
	</div>
{:else if subs.length === 0}
	<div class="empty">
		<p>"{group.name}" has no subreddits yet.</p>
		<p>Add some to this group in Settings → Feeds.</p>
		<a class="cta" href="/settings">Manage groups</a>
	</div>
{:else if error}
	<div class="error">
		Couldn't load this group ({error}).
		<button onclick={() => load(true)}>Retry</button>
	</div>
{:else}
	<FeedList {posts} {loading} hasMore={false} applyFilters {staleAt} onRefresh={refresh} />
{/if}

<style>
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
	}
</style>
