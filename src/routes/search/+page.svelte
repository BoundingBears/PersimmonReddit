<script lang="ts">
	import { UNEXPECTED } from '$lib/reddit/failure';
	import { blockedUsers, isBlocked } from '$lib/stores/blockedUsers';
	import { filters, isMutedSub } from '$lib/stores/filters';
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostCompact from '$lib/components/feed/PostCompact.svelte';
	import Tabs from '$lib/components/shared/Tabs.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { formatScore } from '$lib/utils/format';
	import { searchPosts, searchSubreddits, searchUsers } from '$lib/reddit/endpoints';
	import { subscribed } from '$lib/stores/subscribed';
	import { tick as haptic } from '$lib/utils/haptics';
	import {
		captureScrollAnchor,
		restoreScrollAnchor,
		type ScrollAnchor
	} from '$lib/utils/scrollRestore';
	import { isShareLink, parseRedditUrl } from '$lib/utils/parseRedditUrl';
	import { openRedditLink } from '$lib/utils/installDeepLinks';
	import type { Post, Subreddit, User } from '$lib/reddit/types';

	function isSubbed(name: string): boolean {
		return $subscribed.some((e) => e.name.toLowerCase() === name.toLowerCase());
	}
	// Subscribe straight from the results — search already gives us the icon /
	// color / subscriber count, so no extra fetch is needed (unlike r/[sub]).
	function toggleSub(s: Subreddit) {
		if (isSubbed(s.name)) {
			subscribed.remove(s.name);
		} else {
			subscribed.add(s.name, {
				iconImg: s.iconImg || s.communityIcon,
				primaryColor: s.primaryColor,
				subscribers: s.subscribers
			});
		}
		haptic();
	}

	type Tab = 'posts' | 'subreddits' | 'users';
	const TABS: Tab[] = ['posts', 'subreddits', 'users'];
	const TAB_ITEMS: ReadonlyArray<{ value: Tab; label: string }> = [
		{ value: 'posts', label: 'Posts' },
		{ value: 'subreddits', label: 'Subreddits' },
		{ value: 'users', label: 'Users' }
	];

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

	// A pasted Reddit link is not something to search for, it is somewhere to
	// go: the post, subreddit or profile it points at. Finding a post in the
	// app that you already have a link to used to mean searching for its title.
	function redditLinkIn(text: string): string | null {
		const found = text.match(/(?:https?:\/\/)?(?:[a-z]+\.)?(?:reddit\.com|redd\.it)\/\S+/i)?.[0];
		if (!found) return null;
		const url = /^https?:\/\//i.test(found) ? found : `https://${found}`;
		return parseRedditUrl(url) || isShareLink(url) ? url : null;
	}

	async function run() {
		if (!q.trim()) return;
		const link = redditLinkIn(q.trim());
		if (link) {
			q = '';
			await openRedditLink(link);
			return;
		}
		loading = true;
		error = null;
		try {
			// A failed search is an answer, not an exception: its message is
			// already a sentence (failure.ts).
			if (tab === 'posts') {
				const r = await searchPosts(q);
				if (r.ok) posts = r.data.items;
				else error = r.error.message;
			} else if (tab === 'subreddits') {
				const r = await searchSubreddits(q);
				if (r.ok) subs = r.data.items;
				else error = r.error.message;
			} else {
				const r = await searchUsers(q);
				if (r.ok) users = r.data.items;
				else error = r.error.message;
			}
		} catch (e) {
			console.error('search failed', e);
			error = UNEXPECTED;
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

	// On mount: if we have a query in the URL (back-navigation case) and the
	// snapshot didn't restore results, run the search to populate them.
	$effect(() => {
		untrack(() => {
			if (!q.trim()) return;
			const haveResults =
				(tab === 'posts' && posts.length > 0) ||
				(tab === 'subreddits' && subs.length > 0) ||
				(tab === 'users' && users.length > 0);
			if (!haveResults) run();
		});
	});

	// Persist result arrays across navigations so the swipe-back peek
	// transitions seamlessly into the real page (no flash + refetch).
	// q and tab are already restored via the URL.
	//
	// Scroll is restored here rather than left to SvelteKit: SvelteKit applies
	// its saved offset before snapshot.restore() repopulates the results, so it
	// gets clamped against an empty page and lands the user at the top.
	type Snap = { posts: Post[]; subs: Subreddit[]; users: User[]; anchor: ScrollAnchor };
	let pendingAnchor: ScrollAnchor | null = null;
	export const snapshot = {
		capture: (): Snap => ({ posts, subs, users, anchor: captureScrollAnchor() }),
		restore: (v: Snap) => {
			posts = v.posts;
			subs = v.subs;
			users = v.users;
			pendingAnchor = v.anchor ?? null;
		}
	};

	let cancelRestore: (() => void) | null = null;
	afterNavigate(() => {
		if (!pendingAnchor) return;
		cancelRestore = restoreScrollAnchor(pendingAnchor);
		pendingAnchor = null;
	});
	onDestroy(() => cancelRestore?.());
</script>

<TopAppBar title="Search" />

<div class="search-row">
	<Icon name="search" size={20} />
	<input bind:value={q} onkeydown={onKey} placeholder="Search Reddit, or paste a Reddit link" />
	<button onclick={() => { syncUrl(); run(); }} class="go" disabled={!q.trim() || loading}>Go</button>
</div>

<Tabs tabs={TAB_ITEMS} value={tab} onchange={selectTab} />

{#if error}<ErrorState message={error} />{/if}
{#if loading}<div class="status">Searching…</div>{/if}

{#if tab === 'posts'}
	{#each posts.filter((p) => !isBlocked($blockedUsers, p.author) && !isMutedSub(p.subreddit, $filters)) as p (p.id)}<PostCompact post={p} />{/each}
{:else if tab === 'subreddits'}
	{#each subs as s (s.name)}
		<div class="sub-row">
			<a class="sub-link" href={`/r/${s.name}`}>
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
			<button
				class="sub-toggle"
				class:subbed={isSubbed(s.name)}
				onclick={() => toggleSub(s)}
				aria-label={isSubbed(s.name) ? `Unsubscribe from r/${s.name}` : `Subscribe to r/${s.name}`}
			>
				<Icon name={isSubbed(s.name) ? 'check' : 'add'} size={16} />
				{isSubbed(s.name) ? 'Added' : 'Add'}
			</button>
		</div>
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
		font-weight: var(--weight-title);
	}
	.go:disabled {
		opacity: 0.5;
	}
	.sub-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 8px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.sub-link {
		display: flex;
		gap: 12px;
		flex: 1;
		min-width: 0;
		padding: 10px 14px;
		color: inherit;
	}
	/* The same Add / Added button as the Subs tab. */
	.sub-toggle {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		margin-right: 12px;
		padding: 0 14px 0 10px;
		border-radius: 17px;
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.sub-toggle.subbed {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
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
		font-weight: var(--weight-title);
		font-size: var(--type-body);
	}
	.sub-stats {
		font-size: var(--type-caption);
		color: var(--md-sys-color-on-surface-variant);
	}
	.sub-desc {
		font-size: var(--type-meta);
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
</style>
