<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostCompact from '$lib/components/feed/PostCompact.svelte';
	import CommentNode from '$lib/components/comments/CommentNode.svelte';
	import { formatScore } from '$lib/utils/format';
	import { getUser, getUserOverviewListing } from '$lib/reddit/endpoints';
	import type { Comment, Post, User } from '$lib/reddit/types';

	let username = $derived($page.params.user ?? '');

	let user = $state<User | null>(null);
	let items = $state<Array<{ kind: 'post'; post: Post } | { kind: 'comment'; comment: Comment }>>([]);
	let after = $state<string | null>(null);
	let tab = $state<'overview' | 'posts' | 'comments'>('overview');
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function loadProfile() {
		const r = await getUser(username);
		if (r.ok) user = r.data;
	}

	async function loadFeed(reset = false) {
		if (loading) return;
		loading = true;
		const opts = reset ? undefined : { after: after ?? undefined };
		try {
			const r = await getUserOverviewListing(username, opts);
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			const filtered = tab === 'overview' ? r.data.items : r.data.items.filter((i) => i.kind === (tab === 'posts' ? 'post' : 'comment'));
			items = reset ? filtered : [...items, ...filtered];
			after = r.data.after;
		} catch (e) {
			console.error('user load failed', username, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		username;
		untrack(() => loadProfile());
	});

	$effect(() => {
		username;
		tab;
		untrack(() => {
			items = [];
			after = null;
			loadFeed(true);
		});
	});
</script>

<TopAppBar title="u/{username}" subtitle={user ? `${formatScore(user.totalKarma)} karma` : ''} showBack />

{#if user}
	<header class="profile">
		{#if user.iconImg}
			<img class="avatar" src={user.iconImg} alt="" referrerpolicy="no-referrer" />
		{/if}
		<div class="stats">
			<div><strong>{formatScore(user.linkKarma)}</strong> post karma</div>
			<div><strong>{formatScore(user.commentKarma)}</strong> comment karma</div>
		</div>
	</header>
{/if}

<nav class="tabs" role="tablist">
	{#each ['overview', 'posts', 'comments'] as t}
		<button
			class="tab"
			class:active={tab === t}
			onclick={() => (tab = t as typeof tab)}
		>
			{t}
		</button>
	{/each}
</nav>

{#if error}<div class="error">{error}</div>{/if}

<div class="list">
	{#each items as item, i (item.kind === 'post' ? `p-${item.post.id}` : `c-${item.comment.fullId}`)}
		{#if item.kind === 'post'}
			<PostCompact post={item.post} />
		{:else}
			<div class="comment-row">
				<a class="post-ref" href={`/comments/${item.comment.permalink.split('/')[4] ?? ''}`}>
					on a post in r/{item.comment.permalink.split('/')[2] ?? ''}
				</a>
				<CommentNode comment={item.comment} linkFullId="" />
			</div>
		{/if}
	{/each}
	{#if loading}<div class="status">Loading…</div>{/if}
	{#if !loading && !error && items.length === 0}
		<div class="empty">
			<div class="empty-title">Nothing here yet</div>
			<div class="empty-sub">
				u/{username} has no {tab === 'overview' ? 'activity' : tab}.
			</div>
		</div>
	{/if}
	{#if !loading && after}
		<button class="more" onclick={() => loadFeed(false)}>Load more</button>
	{/if}
</div>

<style>
	.profile {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 32px;
		object-fit: cover;
	}
	.stats {
		font-size: 13px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.stats strong {
		color: var(--md-sys-color-on-surface);
		font-weight: 600;
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
	.list {
		display: flex;
		flex-direction: column;
	}
	.comment-row {
		padding: 8px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.post-ref {
		font-size: 12px;
		color: var(--md-sys-color-primary);
	}
	.status,
	.more {
		padding: 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.more {
		font-weight: 500;
		color: var(--md-sys-color-primary);
	}
	.error {
		padding: 12px 16px;
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.empty {
		padding: 48px 24px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.empty-title {
		font-size: 15px;
		font-weight: 500;
		color: var(--md-sys-color-on-surface);
		margin-bottom: 4px;
	}
	.empty-sub {
		font-size: 13px;
	}
</style>
