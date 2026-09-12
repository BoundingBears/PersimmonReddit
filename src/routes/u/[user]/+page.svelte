<script lang="ts">
	import { undoable } from '$lib/utils/undoable';
	import { pushToast } from '$lib/stores/toast';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { blockedUsers, isBlocked } from '$lib/stores/blockedUsers';
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostCompact from '$lib/components/feed/PostCompact.svelte';
	import CommentNode from '$lib/components/comments/CommentNode.svelte';
	import { formatScore } from '$lib/utils/format';
	import { getUser, getUserOverviewListing } from '$lib/reddit/endpoints';
	import {
		captureScrollAnchor,
		restoreScrollAnchor,
		type ScrollAnchor
	} from '$lib/utils/scrollRestore';
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

	let restoring = $state(false);

	let blocked = $derived(isBlocked($blockedUsers, username));
	function toggleBlock() {
		if (blocked) {
			blockedUsers.unblock(username);
			pushToast(`Unblocked u/${username}`);
			return;
		}
		undoable({
			message: `Blocked u/${username}`,
			perform: () => blockedUsers.block(username),
			undo: () => blockedUsers.unblock(username)
		});
	}

	$effect(() => {
		username;
		tab;
		untrack(() => {
			if (restoring) {
				restoring = false;
				return;
			}
			items = [];
			after = null;
			loadFeed(true);
		});
	});

	// Persist tab + items across navigations so swiping back lands on the
	// same tab and scroll position the user left from, matching the peek.
	//
	// The scroll position has to be restored by us, not by SvelteKit: SvelteKit
	// applies its saved offset *before* it calls snapshot.restore(), so it is
	// clamped against a still-empty list and the user lands near the top.
	type Snap = { tab: typeof tab; items: typeof items; after: typeof after; anchor: ScrollAnchor };
	let pendingAnchor: ScrollAnchor | null = null;
	export const snapshot = {
		capture: (): Snap => ({ tab, items, after, anchor: captureScrollAnchor() }),
		restore: (v: Snap) => {
			restoring = true;
			tab = v.tab;
			items = v.items;
			after = v.after;
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

<TopAppBar title="u/{username}" subtitle={user ? `${formatScore(user.totalKarma)} karma` : ''} showBack>
	{#snippet actions()}
		<button class="iconbtn" onclick={toggleBlock} aria-label={blocked ? 'Unblock user' : 'Block user'}>
			<Icon name={blocked ? 'person' : 'block'} size={22} />
		</button>
	{/snippet}
</TopAppBar>
{#if blocked}
	<div class="blocked-note">You've blocked u/{username}. Their posts and comments are hidden everywhere else in Persimmon.</div>
{/if}

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

<div class="tabs" role="tablist">
	{#each ['overview', 'posts', 'comments'] as t}
		<button
			class="tab"
			class:active={tab === t}
			onclick={() => (tab = t as typeof tab)}
		>
			{t}
		</button>
	{/each}
</div>

{#if error}<ErrorState message={error} />{/if}

<div class="list">
	{#each items as item, i (item.kind === 'post' ? `p-${item.post.id}` : `c-${item.comment.fullId}`)}
		{#if item.kind === 'post'}
			<PostCompact post={item.post} />
		{:else}
			<div class="comment-row" data-post-id={`c-${item.comment.fullId}`}>
				<a class="post-ref" href={`/comments/${item.comment.permalink.split('/')[4] ?? ''}`}>
					on a post in r/{item.comment.permalink.split('/')[2] ?? ''}
				</a>
				<CommentNode comment={item.comment} linkFullId="" />
			</div>
		{/if}
	{/each}
	{#if loading}<div class="status">Loading…</div>{/if}
	{#if !loading && !error && items.length === 0}
		<EmptyState
			title="Nothing here yet"
			body={`u/${username} has no ${tab === 'overview' ? 'activity' : tab}.`}
		/>
	{/if}
	{#if !loading && after}
		<button class="more" onclick={() => loadFeed(false)}>Load more</button>
	{/if}
</div>

<style>
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
	.blocked-note {
		padding: var(--space-md) var(--space-lg);
		font-size: var(--type-secondary);
		line-height: 1.4;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface-variant);
	}
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
		font-size: var(--type-secondary);
		color: var(--md-sys-color-on-surface-variant);
	}
	.stats strong {
		color: var(--md-sys-color-on-surface);
		font-weight: var(--weight-heading);
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.tab {
		flex: 1;
		padding: 10px;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
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
		font-size: var(--type-meta);
		color: var(--md-sys-color-primary);
	}
	.status,
	.more {
		padding: 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.more {
		font-weight: var(--weight-title);
		color: var(--md-sys-color-primary);
	}
</style>
