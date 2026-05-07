<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import { hidden, type HiddenEntry } from '$lib/stores/hidden';
	import { pushToast } from '$lib/stores/toast';
	import { tick as haptic } from '$lib/utils/haptics';
	import { getSubmission } from '$lib/reddit/endpoints';
	import { hiddenMetaFromPost } from '$lib/utils/hiddenMeta';

	// Most recently hidden first.
	let entries = $derived<HiddenEntry[]>(
		[...$hidden.values()].sort((a, b) => b.hiddenAt - a.hiddenAt)
	);

	// Lazily backfill metadata for entries that were hidden under older
	// builds (pre-v1.0.5) and only have an ID. Fires once per page mount;
	// the reddit client's in-memory cache dedupes if the user re-visits.
	onMount(async () => {
		const missing = [...$hidden.values()].filter((e) => !e.title);
		if (missing.length === 0) return;
		await Promise.all(
			missing.map(async (entry) => {
				const r = await getSubmission(entry.id);
				if (r.ok && r.data) hidden.enrich(entry.id, hiddenMetaFromPost(r.data));
			})
		);
	});

	function unhide(entry: HiddenEntry) {
		hidden.unhide(entry.id);
		haptic();
		pushToast('Unhidden', {
			duration: 5000,
			action: { label: 'Re-hide', onClick: () => hidden.hide(entry.id, entry) }
		});
	}

	function openPost(entry: HiddenEntry) {
		goto(`/comments/${entry.id}`);
	}

	function clearAll() {
		const count = $hidden.size;
		if (count === 0) return;
		const snapshot = [...$hidden.values()];
		hidden.clear();
		haptic();
		pushToast(`Cleared ${count} hidden posts`, {
			duration: 6000,
			action: {
				label: 'Undo',
				onClick: () => {
					for (const entry of snapshot) {
						hidden.hide(entry.id, entry);
					}
				}
			}
		});
	}
</script>

<TopAppBar title="Hidden posts" subtitle="{$hidden.size} posts" showBack>
	{#snippet actions()}
		{#if $hidden.size > 0}
			<button class="clear" onclick={clearAll}>Clear all</button>
		{/if}
	{/snippet}
</TopAppBar>

{#if entries.length === 0}
	<div class="empty">
		<div class="empty-title">No hidden posts</div>
		<div class="empty-sub">Long-press a post in any feed and tap "Hide" to hide it from feeds.</div>
	</div>
{:else}
	<ul class="list">
		{#each entries as entry (entry.id)}
			<li class="row">
				<button class="thumb" onclick={() => openPost(entry)} aria-label="Open post">
					{#if entry.thumbnail}
						<img src={entry.thumbnail} alt="" referrerpolicy="no-referrer" />
					{:else}
						<Icon name="visibility_off" size={20} />
					{/if}
				</button>
				<button class="body" onclick={() => openPost(entry)}>
					<div class="title">{entry.title ?? `Hidden post ${entry.id}`}</div>
					<div class="meta">
						{#if entry.subreddit}r/{entry.subreddit}{/if}
						{#if entry.subreddit && entry.author}<span class="dot">·</span>{/if}
						{#if entry.author}u/{entry.author}{/if}
						{#if entry.hiddenAt > 0}
							<span class="dot">·</span>
							hidden <RelativeTime ts={Math.floor(entry.hiddenAt / 1000)} />
						{/if}
					</div>
				</button>
				<button class="unhide" onclick={() => unhide(entry)} aria-label="Unhide">
					<Icon name="visibility" size={22} />
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.clear {
		padding: 6px 12px;
		font: inherit;
		font-size: 13px;
		color: var(--md-sys-color-error);
		background: transparent;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 16px;
	}
	.clear:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.thumb {
		width: 56px;
		height: 56px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		overflow: hidden;
		background: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-on-surface-variant);
		padding: 0;
		border: 0;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: left;
		padding: 0;
		background: transparent;
		border: 0;
		font: inherit;
		color: inherit;
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		color: var(--md-sys-color-on-surface);
	}
	.meta {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.dot {
		opacity: 0.6;
	}
	.unhide {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--md-sys-color-primary);
	}
	.unhide:active {
		background: var(--md-sys-color-surface-container-high);
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
