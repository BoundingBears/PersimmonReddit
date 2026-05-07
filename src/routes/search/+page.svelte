<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostCompact from '$lib/components/feed/PostCompact.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { formatScore } from '$lib/utils/format';
	import { searchPosts, searchSubreddits, searchUsers } from '$lib/reddit/endpoints';
	import type { Post, Subreddit, User } from '$lib/reddit/types';

	type Tab = 'posts' | 'subreddits' | 'users';
	const TABS: Tab[] = ['posts', 'subreddits', 'users'];

	// Hydrate state from URL so back-navigation restores the user's query and
	// active tab. We re-sync the URL whenever either changes (replaceState so
	// we don't pollute history with every keystroke).
	let q = $state($page.url.searchParams.get('q') ?? '');
	let initialTab = $page.url.searchParams.get('tab') as Tab;
	let tab = $state<Tab>(TABS.includes(initialTab) ? initialTab : 'posts');

	let posts = $state<Post[]>([]);
	let subs = $state<Subreddit[]>([]);
	let users = $state<User[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	function syncUrl() {
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q);
		if (tab !== 'posts') params.set('tab', tab);
		const next = `/search${params.toString() ? '?' + params.toString() : ''}`;
		if (next !== $page.url.pathname + $page.url.search) {
			goto(next, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	async function run() {
		if (!q.trim()) return;
		loading = true;
		error = null;
		try {
			if (tab === 'posts') {
				const r = await searchPosts(q);
				if (!r.ok) throw r.error;
				posts = r.data.items;
			} else if (tab === 'subreddits') {
				const r = await searchSubreddits(q);
				if (!r.ok) throw r.error;
				subs = r.data.items;
			} else {
				const r = await searchUsers(q);
				if (!r.ok) throw r.error;
				users = r.data.items;
			}
		} catch (e: any) {
			error = e?.message ?? 'search failed';
		} finally {
			loading = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			syncUrl();
			run();
		}
	}

	function selectTab(t: Tab) {
		tab = t;
		syncUrl();
		if (q.trim()) run();
	}

	// On mount: if we have a query in the URL (back-navigation case), run it
	// automatically so the user's previous results re-appear.
	$effect(() => {
		untrack(() => {
			if (q.trim()) run();
		});
	});
</script>

<TopAppBar title="Search" />

<div class="search-row">
	<Icon name="search" size={20} />
	<input bind:value={q} onkeydown={onKey} placeholder="Search Reddit…" />
	<button onclick={() => { syncUrl(); run(); }} class="go" disabled={!q.trim() || loading}>Go</button>
</div>

<nav class="tabs" role="tablist">
	{#each TABS as t}
		<button class="tab" class:active={tab === t} onclick={() => selectTab(t)}>
			{t}
		</button>
	{/each}
</nav>

{#if error}<div class="error">{error}</div>{/if}
{#if loading}<div class="status">Searching…</div>{/if}

{#if tab === 'posts'}
	{#each posts as p (p.id)}<PostCompact post={p} />{/each}
{:else if tab === 'subreddits'}
	{#each subs as s (s.name)}
		<a class="sub-row" href={`/r/${s.name}`}>
			{#if s.iconImg}
				<img src={s.iconImg} alt="" referrerpolicy="no-referrer" />
			{:else}
				<div class="placeholder"><Icon name="forum" size={20} /></div>
			{/if}
			<div class="sub-meta">
				<div class="sub-name">r/{s.name}</div>
				<div class="sub-stats">{formatScore(s.subscribers)} members</div>
				{#if s.publicDescription}
					<div class="sub-desc">{s.publicDescription}</div>
				{/if}
			</div>
		</a>
	{/each}
{:else}
	{#each users as u (u.name)}
		<a class="sub-row" href={`/u/${u.name}`}>
			{#if u.iconImg}
				<img src={u.iconImg} alt="" referrerpolicy="no-referrer" />
			{:else}
				<div class="placeholder"><Icon name="person" size={20} /></div>
			{/if}
			<div class="sub-meta">
				<div class="sub-name">u/{u.name}</div>
				<div class="sub-stats">{formatScore(u.totalKarma)} karma</div>
			</div>
		</a>
	{/each}
{/if}

<style>
	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--md-sys-color-surface-container);
	}
	input {
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 24px;
		font: inherit;
	}
	.go {
		padding: 8px 14px;
		border-radius: 20px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font-weight: 500;
	}
	.go:disabled {
		opacity: 0.5;
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.tab {
		flex: 1;
		padding: 10px;
		font-size: 13px;
		font-weight: 500;
		color: var(--md-sys-color-on-surface-variant);
		text-transform: capitalize;
		border-bottom: 2px solid transparent;
	}
	.tab.active {
		color: var(--md-sys-color-primary);
		border-bottom-color: var(--md-sys-color-primary);
	}
	.sub-row {
		display: flex;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.sub-row img,
	.placeholder {
		width: 48px;
		height: 48px;
		border-radius: 24px;
		flex: none;
		object-fit: cover;
		background: var(--md-sys-color-surface-container);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.sub-meta {
		flex: 1;
		min-width: 0;
	}
	.sub-name {
		font-weight: 500;
		font-size: 14px;
	}
	.sub-stats {
		font-size: 11px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.sub-desc {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 4px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.status {
		padding: 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.error {
		padding: 12px 16px;
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
</style>
