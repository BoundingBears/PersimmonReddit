<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { getSubmissions, getSubreddit } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { subscribed } from '$lib/stores/subscribed';
	import { getFeedSnapshot, saveFeedSnapshot } from '$lib/stores/feedSnapshot';
	import type { Post, Sort } from '$lib/reddit/types';

	let sub = $derived($page.params.sub ?? '');

	// Snapshot key keyed by sub so each subreddit's feed is restored independently.
	let snapshotKey = $derived(`r:${sub.toLowerCase()}`);
	const initialSnap = getFeedSnapshot(`r:${($page.params.sub ?? '').toLowerCase()}`);

	let posts = $state<Post[]>(initialSnap?.posts ?? []);
	let after = $state<string | null>(initialSnap?.after ?? null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let sort = $state<Sort>((initialSnap?.sort as Sort) ?? 'hot');
	let restored = $state(!!initialSnap);
	let scrollRestored = $state(false);

	async function load(reset = false) {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const r = await getSubmissions(sort, sub, reset ? undefined : { after: after ?? undefined });
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			posts = reset ? r.data.items : [...posts, ...r.data.items];
			after = r.data.after;
		} catch (e) {
			console.error('r/[sub] load failed', sub, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		sort;
		sub;
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

	afterNavigate(() => {
		if (scrollRestored || !initialSnap) return;
		scrollRestored = true;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				window.scrollTo({
					top: initialSnap.scrollY,
					behavior: 'instant' as ScrollBehavior
				});
			})
		);
	});

	// Save in beforeNavigate (not onDestroy) so we capture the real scrollY
	// before the page DOM unmounts and the browser clamps it to 0.
	beforeNavigate(() => {
		if (typeof window === 'undefined' || posts.length === 0) return;
		saveFeedSnapshot(snapshotKey, { posts, after, sort, scrollY: window.scrollY });
	});

	let isSubbed = $derived(
		$subscribed.some((s) => s.name.toLowerCase() === sub.toLowerCase())
	);
	const sorts: Sort[] = ['hot', 'new', 'top', 'rising'];

	async function toggleSub() {
		if (isSubbed) {
			subscribed.remove(sub);
			return;
		}
		// Optimistic add (instant UI feedback), then enrich with icon/color
		// from the about endpoint so the subscribed list shows the proper chip.
		subscribed.add(sub);
		const r = await getSubreddit(sub);
		if (r.ok) {
			subscribed.add(r.data.name, {
				iconImg: r.data.iconImg || r.data.communityIcon,
				primaryColor: r.data.primaryColor,
				subscribers: r.data.subscribers
			});
		}
	}

	async function refresh() {
		clearCache();
		posts = [];
		after = null;
		await load(true);
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}
</script>

<TopAppBar title="r/{sub}" subtitle={sort} showBack>
	{#snippet actions()}
		<button class="iconbtn" onclick={toggleSub} aria-label={isSubbed ? 'Unsubscribe' : 'Subscribe'}>
			<Icon name={isSubbed ? 'bookmark' : 'bookmark_border'} size={22} filled={isSubbed} />
		</button>
		<select class="sort" bind:value={sort} aria-label="Sort">
			{#each sorts as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	{/snippet}
</TopAppBar>

{#if error}
	<div class="error">
		Couldn't load r/{sub} ({error}).
		<button onclick={() => load(true)}>Retry</button>
	</div>
{/if}

<FeedList
	{posts}
	{loading}
	hasMore={after !== null}
	feedKey={{ sort, subreddit: sub, after }}
	onLoadMore={() => load(false)}
	onRefresh={refresh}
/>

<style>
	.sort {
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 8px;
		padding: 4px 8px;
		font: inherit;
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
	}
	.iconbtn:active {
		background: var(--md-sys-color-surface-container-highest);
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
