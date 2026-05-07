<script lang="ts">
	import { untrack } from 'svelte';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import { getMergedSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { subscribed } from '$lib/stores/subscribed';
	import type { Post, Sort } from '$lib/reddit/types';

	let posts = $state<Post[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let sort = $state<Sort>('hot');

	async function load() {
		if (loading) return;
		const subs = $subscribed.map((s) => s.name);
		if (subs.length === 0) {
			posts = [];
			return;
		}
		loading = true;
		error = null;
		try {
			const r = await getMergedSubmissions(subs, sort, { limitPerSub: 25 });
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			posts = r.data.items;
		} catch (e) {
			console.error('subscribed load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// re-fetch when sort or the subscribed list changes
		sort;
		$subscribed;
		untrack(() => load());
	});

	async function refresh() {
		clearCache();
		await load();
		window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
	}

	const sorts: Sort[] = ['hot', 'new', 'top'];
</script>

<TopAppBar title="Subscribed" subtitle="{$subscribed.length} subs · {sort}" showBack>
	{#snippet actions()}
		<select class="sort" bind:value={sort} aria-label="Sort">
			{#each sorts as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	{/snippet}
</TopAppBar>

{#if $subscribed.length === 0}
	<div class="empty">
		<p>You haven't subscribed to anything yet.</p>
		<p>Bookmark subreddits from the Subs tab or any subreddit page; they'll show up here as a unified feed.</p>
		<a class="cta" href="/subreddits">Discover subreddits</a>
	</div>
{:else if error}
	<div class="error">
		Couldn't load merged feed ({error}).
		<button onclick={load}>Retry</button>
	</div>
{:else}
	<FeedList {posts} {loading} hasMore={false} onRefresh={refresh} />
{/if}

<style>
	.sort {
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 8px;
		padding: 4px 8px;
		font: inherit;
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
	}
</style>
