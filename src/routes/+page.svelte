<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { getSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { getFeedSnapshot, saveFeedSnapshot } from '$lib/stores/feedSnapshot';
	import type { Post, Sort } from '$lib/reddit/types';

	const SNAPSHOT_KEY = 'home';

	// Hydrate from cached snapshot if we have one (back-navigation case).
	const snap = getFeedSnapshot(SNAPSHOT_KEY);
	let posts = $state<Post[]>(snap?.posts ?? []);
	let after = $state<string | null>(snap?.after ?? null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let sort = $state<Sort>((snap?.sort as Sort) ?? 'hot');
	let restored = $state(!!snap);
	let scrollRestored = $state(false);

	async function load(reset = false) {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const r = await getSubmissions(sort, undefined, reset ? undefined : { after: after ?? undefined });
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			posts = reset ? r.data.items : [...posts, ...r.data.items];
			after = r.data.after;
		} catch (e) {
			console.error('home load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// On sort change re-fetch. On the very first run after a snapshot
		// restore, skip — we already have the data the user was viewing.
		sort;
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
		saveFeedSnapshot(SNAPSHOT_KEY, { posts, after, sort, scrollY: window.scrollY });
	});

	async function refresh() {
		clearCache();
		posts = [];
		after = null;
		await load(true);
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}

	const sorts: Sort[] = ['hot', 'new', 'top', 'rising'];
</script>

<TopAppBar title="Persimmon" subtitle="Front page · {sort}">
	{#snippet actions()}
		<select class="sort" bind:value={sort} aria-label="Sort">
			{#each sorts as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
		<a href="/settings" class="iconbtn" aria-label="Settings"><Icon name="settings" size={22} /></a>
	{/snippet}
</TopAppBar>

{#if error}
	<div class="error">
		Couldn't reach Reddit ({error}).
		<button onclick={() => load(true)}>Retry</button>
	</div>
{/if}

<FeedList
	{posts}
	{loading}
	hasMore={after !== null}
	feedKey={{ sort, after }}
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
		color: var(--md-sys-color-on-surface);
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
		font-weight: 500;
	}
</style>
