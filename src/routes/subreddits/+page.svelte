<script lang="ts">
	import { UNEXPECTED } from '$lib/reddit/failure';
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { formatScore } from '$lib/utils/format';
	import { getPopularSubreddits, getSubreddit, searchSubreddits } from '$lib/reddit/endpoints';
	import { subscribed } from '$lib/stores/subscribed';
	import { flip } from 'svelte/animate';
	import { dragReorder } from '$lib/actions/dragReorder';
	import { pushToast } from '$lib/stores/toast';
	import type { Subreddit } from '$lib/reddit/types';

	let subs = $state<Subreddit[]>([]);
	let after = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Finding a subreddit to add, right here. This used to mean leaving for the
	// Search tab, searching, switching its results to "Subreddits", and coming
	// back; adding three was that three times over.
	let query = $state('');
	let found = $state<Subreddit[]>([]);
	let finding = $state(false);
	let findGen = 0;
	let findTimer: ReturnType<typeof setTimeout> | null = null;
	let q = $derived(query.trim().replace(/^\/?r\//i, ''));
	$effect(() => {
		const term = q;
		if (findTimer) clearTimeout(findTimer);
		const gen = ++findGen;
		if (term.length < 2) {
			found = [];
			finding = false;
			return;
		}
		finding = true;
		findTimer = setTimeout(async () => {
			const r = await searchSubreddits(term, { limit: 15 });
			if (gen !== findGen) return;
			found = r.ok ? r.data.items : [];
			finding = false;
		}, 300);
	});

	function toggle(s: Subreddit) {
		if (subscribed.has(s.name, $subscribed)) subscribed.remove(s.name);
		else
			subscribed.add(s.name, {
				iconImg: s.iconImg || s.communityIcon,
				primaryColor: s.primaryColor,
				subscribers: s.subscribers
			});
	}

	// Edit mode for the subscribed list: rows stop navigating, grow a drag
	// handle, and can be reordered. Order matters beyond the list — the merged
	// feed round-robins through subs in this order for hot/top/rising.
	let editing = $state(false);
	function sortAlpha() {
		subscribed.sortAlpha();
		pushToast('Sorted A–Z');
	}

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
			error = UNEXPECTED;
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

<TopAppBar title="Subreddits">
	{#snippet actions()}
		{#if $subscribed.length > 1}
			{#if editing}
				<button class="iconbtn" onclick={sortAlpha} aria-label="Sort A to Z">
					<Icon name="sort_by_alpha" size={22} />
				</button>
				<button class="textbtn" onclick={() => (editing = false)}>Done</button>
			{:else}
				<button class="iconbtn" onclick={() => (editing = true)} aria-label="Edit subscribed list">
					<Icon name="edit" size={22} />
				</button>
			{/if}
		{/if}
	{/snippet}
</TopAppBar>

{#snippet subRow(s: Subreddit)}
	{@const added = subscribed.has(s.name, $subscribed)}
	<div class="sub-row">
		<a class="row-link" href={`/r/${s.name}`}>
			{#if s.iconImg || s.communityIcon}
				<img src={s.iconImg || s.communityIcon} alt="" referrerpolicy="no-referrer" />
			{:else}
				<div class="placeholder"><Icon name="forum" size={20} /></div>
			{/if}
			<div class="meta">
				<div class="name">r/{s.name}</div>
				<div class="stats">
					{s.subscribers || !s.weeklyVisitors ? `${formatScore(s.subscribers)} members` : `${formatScore(s.weeklyVisitors)} weekly visitors`}
				</div>
				{#if s.publicDescription}
					<div class="desc">{s.publicDescription}</div>
				{/if}
			</div>
		</a>
		<button class="add" class:added onclick={() => toggle(s)} aria-label={added ? `Remove r/${s.name}` : `Add r/${s.name}`}>
			<Icon name={added ? 'check' : 'add'} size={16} />
			{added ? 'Added' : 'Add'}
		</button>
	</div>
{/snippet}

<label class="find">
	<Icon name="search" size={20} />
	<input
		type="search"
		bind:value={query}
		placeholder="Find a subreddit to add"
		autocapitalize="off"
		autocomplete="off"
		spellcheck="false"
		enterkeyhint="search"
	/>
	{#if query}
		<button class="iconbtn" onclick={() => (query = '')} aria-label="Clear"><Icon name="close" size={20} /></button>
	{/if}
</label>

{#if q.length >= 2}
	<section class="section">
		{#each found as s (s.name)}
			{@render subRow(s)}
		{/each}
		{#if finding && found.length === 0}
			<div class="status">Searching…</div>
		{:else if !finding && found.length === 0}
			<div class="status">No subreddits match "{q}".</div>
		{/if}
	</section>
{:else}
{#if $subscribed.length > 0}
	<section class="section">
		<h2 class="section-title section-label">Subscribed ({$subscribed.length})</h2>
		<a class="row-link feed" href="/subscribed">
			<div class="placeholder primary"><Icon name="bookmarks" size={20} filled /></div>
			<div class="meta">
				<div class="name">All subscribed</div>
				<div class="stats">Combined feed</div>
			</div>
		</a>
		<div
			class="sub-list"
			use:dragReorder={{
				handle: '.handle',
				row: '.sub-row',
				enabled: editing,
				onMove: (from, to) => subscribed.move(from, to)
			}}
		>
		{#each $subscribed as entry, i (entry.name)}
			<div class="sub-row" class:editing data-index={i} animate:flip={{ duration: 160 }}>
				<!-- No href while editing: a tap mid-rearrange must not navigate. -->
				<a class="row-link" href={editing ? undefined : `/r/${entry.name}`}>
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
				{#if editing}
					<!-- Pointer-only affordance; keyboard users have Sort A–Z. Hidden from
					     AT rather than given a button role it can't honour. -->
					<span class="handle" aria-hidden="true">
						<Icon name="drag_handle" size={24} />
					</span>
				{/if}
			</div>
		{/each}
		</div>
	</section>
{/if}

<section class="section">
	<h2 class="section-title section-label">Popular</h2>
	{#if error}<ErrorState message={error} />{/if}
	{#each subs as s (s.name)}
		{@render subRow(s)}
	{/each}
	{#if loading}<div class="status">Loading…</div>{/if}
	{#if !loading && after}
		<button class="more" onclick={() => load(false)}>Load more</button>
	{/if}
</section>
{/if}

<style>
	.section {
		padding-bottom: 8px;
	}
	.section-title {
		padding: 14px 16px 8px;
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
		font-weight: var(--weight-title);
	}
	.stats {
		font-size: var(--type-caption);
		color: var(--md-sys-color-on-surface-variant);
	}
	.desc {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 2px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.find {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 12px 2px;
		padding: 0 6px 0 14px;
		height: 46px;
		border-radius: 23px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
	}
	.find input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--md-sys-color-on-surface);
		font: inherit;
		font-size: var(--type-body-lg);
	}
	.find input::-webkit-search-cancel-button {
		display: none;
	}
	/* Says what a tap will do, in words. The bookmark it replaces is what the
	   app uses for saving posts. */
	.add {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		padding: 0 14px 0 10px;
		border-radius: 17px;
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.add.added {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
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
		font-size: var(--type-secondary);
	}
	.more {
		font-weight: var(--weight-title);
		color: var(--md-sys-color-primary);
	}
	.textbtn {
		padding: 8px 12px;
		border-radius: 20px;
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-primary);
	}
	.textbtn:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	/* The grab area. touch-action:none is what lets pointermove keep firing on
	   a touch drag instead of the browser claiming it as a scroll. */
	.handle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin-right: 4px;
		color: var(--md-sys-color-on-surface-variant);
		touch-action: none;
		cursor: grab;
	}
	.sub-row.editing .row-link {
		cursor: default;
	}
	/* `dragging` is added by the action at runtime, so it must be :global or
	   Svelte's scoped-CSS pass strips the rule as unused. */
	.sub-row:global(.dragging) {
		background: var(--md-sys-color-surface-container-high);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		position: relative;
		z-index: 1;
	}
</style>
