<script lang="ts">
	import { goto } from '$app/navigation';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import { saved, type SavedEntry } from '$lib/stores/saved';
	import { prefs } from '$lib/stores/prefs';
	import { IS_IOS } from '$lib/utils/platform';
	import { pushToast } from '$lib/stores/toast';
	import { tick as haptic } from '$lib/utils/haptics';

	// Most recently saved first.
	let entries = $derived<SavedEntry[]>(
		[...$saved.values()].sort((a, b) => b.savedAt - a.savedAt)
	);

	function blurThumb(entry: SavedEntry): boolean {
		if (!entry.nsfw) return false;
		return IS_IOS || $prefs.blurNsfw;
	}

	function unsave(entry: SavedEntry) {
		saved.unsave(entry.id);
		haptic();
		pushToast('Removed from saved', {
			duration: 5000,
			action: { label: 'Undo', onClick: () => saved.save(entry.id, entry) }
		});
	}

	function openPost(entry: SavedEntry) {
		goto(`/comments/${entry.id}`);
	}

	function clearAll() {
		const count = $saved.size;
		if (count === 0) return;
		const snapshot = [...$saved.values()];
		saved.clear();
		haptic();
		pushToast(`Cleared ${count} saved posts`, {
			duration: 6000,
			action: {
				label: 'Undo',
				onClick: () => {
					for (const entry of snapshot) saved.save(entry.id, entry);
				}
			}
		});
	}
</script>

<TopAppBar title="Saved posts" subtitle="{$saved.size} posts" showBack>
	{#snippet actions()}
		{#if $saved.size > 0}
			<button class="clear" onclick={clearAll}>Clear all</button>
		{/if}
	{/snippet}
</TopAppBar>

{#if entries.length === 0}
	<div class="empty">
		<div class="empty-title">No saved posts</div>
		<div class="empty-sub">Tap the bookmark icon on any post to save it here for later.</div>
	</div>
{:else}
	<ul class="list">
		{#each entries as entry (entry.id)}
			<li class="row">
				<button class="thumb" onclick={() => openPost(entry)} aria-label="Open post">
					{#if entry.thumbnail}
						<img src={entry.thumbnail} alt="" referrerpolicy="no-referrer" class:blur={blurThumb(entry)} />
					{:else}
						<Icon name="bookmark" size={20} />
					{/if}
				</button>
				<button class="body" onclick={() => openPost(entry)}>
					<div class="title">{entry.title ?? `Saved post ${entry.id}`}</div>
					<div class="meta">
						{#if entry.subreddit}r/{entry.subreddit}{/if}
						{#if entry.subreddit && entry.author}<span class="dot">·</span>{/if}
						{#if entry.author}u/{entry.author}{/if}
						{#if entry.savedAt > 0}
							<span class="dot">·</span>
							saved <RelativeTime ts={Math.floor(entry.savedAt / 1000)} />
						{/if}
					</div>
				</button>
				<button class="unsave" onclick={() => unsave(entry)} aria-label="Remove from saved">
					<Icon name="bookmark" size={22} filled />
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
	.thumb img.blur {
		filter: blur(16px);
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
	.unsave {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--md-sys-color-primary);
	}
	.unsave:active {
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
