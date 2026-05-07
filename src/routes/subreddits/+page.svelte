<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { formatScore } from '$lib/utils/format';
	import { getPopularSubreddits, getSubreddit } from '$lib/reddit/endpoints';
	import { subscribed } from '$lib/stores/subscribed';
	import type { Subreddit } from '$lib/reddit/types';

	let subs = $state<Subreddit[]>([]);
	let after = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function load(reset = false) {
		if (loading) return;
		loading = true;
		try {
			const r = await getPopularSubreddits(reset ? undefined : { after: after ?? undefined });
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			subs = reset ? r.data.items : [...subs, ...r.data.items];
			after = r.data.after;
		} catch (e) {
			console.error('subreddits load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Older subscribed entries (or any that were added without icon metadata)
	// are auto-healed: fetch /r/<name>/about.json once and merge the icon back
	// into the store.
	async function enrichMissingIcons() {
		const list = get(subscribed);
		const missing = list.filter((e) => !e.iconImg);
		if (missing.length === 0) return;
		const results = await Promise.all(missing.map((e) => getSubreddit(e.name)));
		for (let i = 0; i < missing.length; i++) {
			const r = results[i];
			if (r.ok) {
				subscribed.add(r.data.name, {
					iconImg: r.data.iconImg || r.data.communityIcon,
					primaryColor: r.data.primaryColor,
					subscribers: r.data.subscribers
				});
			}
		}
	}

	$effect(() => {
		untrack(() => {
			load(true);
			enrichMissingIcons();
		});
	});
</script>

<TopAppBar title="Subreddits" />

{#if $subscribed.length > 0}
	<section class="section">
		<h2 class="section-title">Subscribed ({$subscribed.length})</h2>
		<a class="row-link feed" href="/subscribed">
			<div class="placeholder primary"><Icon name="bookmarks" size={20} filled /></div>
			<div class="meta">
				<div class="name">All subscribed</div>
				<div class="stats">Combined feed</div>
			</div>
		</a>
		{#each $subscribed as entry (entry.name)}
			<div class="sub-row">
				<a class="row-link" href={`/r/${entry.name}`}>
					{#if entry.iconImg}
						<img src={entry.iconImg} alt="" referrerpolicy="no-referrer" />
					{:else}
						<div class="placeholder"><Icon name="forum" size={20} /></div>
					{/if}
					<div class="meta">
						<div class="name">r/{entry.name}</div>
						{#if entry.subscribers}
							<div class="stats">{formatScore(entry.subscribers)} members</div>
						{/if}
					</div>
				</a>
				<button class="iconbtn" onclick={() => subscribed.remove(entry.name)} aria-label="Unsubscribe">
					<Icon name="bookmark" size={22} filled />
				</button>
			</div>
		{/each}
	</section>
{/if}

<section class="section">
	<h2 class="section-title">Popular</h2>
	{#if error}<div class="error">{error}</div>{/if}
	{#each subs as s (s.name)}
		<div class="sub-row">
			<a class="row-link" href={`/r/${s.name}`}>
				{#if s.iconImg || s.communityIcon}
					<img src={s.iconImg || s.communityIcon} alt="" referrerpolicy="no-referrer" />
				{:else}
					<div class="placeholder"><Icon name="forum" size={20} /></div>
				{/if}
				<div class="meta">
					<div class="name">r/{s.name}</div>
					<div class="stats">{formatScore(s.subscribers)} members</div>
					{#if s.publicDescription}
						<div class="desc">{s.publicDescription}</div>
					{/if}
				</div>
			</a>
			<button
				class="iconbtn"
				onclick={() =>
					subscribed.has(s.name, $subscribed)
						? subscribed.remove(s.name)
						: subscribed.add(s.name, {
								iconImg: s.iconImg || s.communityIcon,
								primaryColor: s.primaryColor,
								subscribers: s.subscribers
							})}
				aria-label="Toggle subscribe"
			>
				<Icon name={subscribed.has(s.name, $subscribed) ? 'bookmark' : 'bookmark_border'} size={22} filled={subscribed.has(s.name, $subscribed)} />
			</button>
		</div>
	{/each}
	{#if loading}<div class="status">Loading…</div>{/if}
	{#if !loading && after}
		<button class="more" onclick={() => load(false)}>Load more</button>
	{/if}
</section>

<style>
	.section {
		padding-bottom: 8px;
	}
	.section-title {
		margin: 0;
		padding: 12px 16px 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--md-sys-color-on-surface-variant);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
	}
	.row-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--md-sys-color-on-surface);
	}
	.row-link.feed {
		padding: 8px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.placeholder.primary {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
	.sub-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.sub-row img,
	.placeholder {
		width: 40px;
		height: 40px;
		border-radius: 20px;
		object-fit: cover;
		background: var(--md-sys-color-surface-container);
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
	}
	.meta {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-weight: 500;
	}
	.stats {
		font-size: 11px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.desc {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 2px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.iconbtn:active {
		background: var(--md-sys-color-surface-container);
	}
	.status,
	.more {
		padding: 12px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
		font-size: 13px;
	}
	.more {
		font-weight: 500;
		color: var(--md-sys-color-primary);
	}
	.error {
		padding: 12px 16px;
		color: var(--md-sys-color-error);
	}
</style>
