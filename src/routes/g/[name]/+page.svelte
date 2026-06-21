<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import FeedList from '$lib/components/feed/FeedList.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { getMergedSubmissions } from '$lib/reddit/endpoints';
	import { clearCache } from '$lib/reddit/client';
	import { groups } from '$lib/stores/groups';
	import type { Post, Sort } from '$lib/reddit/types';

	let groupName = $derived($page.params.name ?? '');
	let group = $derived($groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase()));
	let subs = $derived(group?.subreddits ?? []);

	let posts = $state<Post[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let staleAt = $state<number | null>(null);
	let sort = $state<Sort>('hot');

	async function load() {
		if (loading) return;
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
			staleAt = r.meta?.staleAt ?? null;
		} catch (e) {
			console.error('group feed load failed', groupName, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// Re-fetch when sort, the group, or its sub list changes.
		sort;
		groupName;
		subs;
		untrack(() => load());
	});

	async function refresh() {
		clearCache();
		await load();
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
		<button onclick={load}>Retry</button>
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
