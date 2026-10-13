<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { onDestroy } from 'svelte';
	import { openPost as openPostLayer } from '$lib/stores/postLayer';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Tabs from '$lib/components/shared/Tabs.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import { undoableClear } from '$lib/utils/undoable';
	import { saved, type SavedEntry } from '$lib/stores/saved';
	import { privatePosts } from '$lib/stores/privatePosts';
	import { movePost, offlineIds, storeOffline, type Collection } from '$lib/stores/offline';
	import { lockAvailable, privateTabOpen, privateUnlocked, privateViewOpen, unlockPrivate } from '$lib/stores/lock';
	import { prefs } from '$lib/stores/prefs';
	import { IS_IOS, IS_NATIVE } from '$lib/utils/platform';
	import { pushToast } from '$lib/stores/toast';
	import { tick as haptic } from '$lib/utils/haptics';

	let tab = $state<Collection>('saved');

	// Most recently saved first.
	const newestFirst = (m: Map<string, SavedEntry>) => [...m.values()].sort((a, b) => b.savedAt - a.savedAt);
	let entries = $derived(newestFirst($saved));
	let privateEntries = $derived(newestFirst($privatePosts));

	// Whether the private folder asks before it opens. With the whole app
	// locked, getting in at all was the asking.
	let locks = $derived(IS_NATIVE && $lockAvailable !== false && $prefs.lockScope === 'private');
	let showPrivate = $derived(tab === 'private' && (!locks || $privateUnlocked));

	// Tell the layout when private posts are actually on screen, so it can keep
	// them out of screenshots and the recents thumbnail.
	$effect(() => {
		privateViewOpen.set(showPrivate);
		privateTabOpen.set(tab === 'private');
	});
	onDestroy(() => {
		privateViewOpen.set(false);
		privateTabOpen.set(false);
	});

	const delayWords: Record<number, string> = { 0: 'as soon as', 30: '30 seconds after', 60: 'a minute after', 300: '5 minutes after' };
	let lockNote = $derived(`Locks again ${delayWords[$prefs.lockDelaySec] ?? 'after'} you leave the app.`);

	function pickTab(next: Collection) {
		// Ask straight away: the tab is the door.
		if (next === 'private' && locks && !$privateUnlocked) void unlockPrivate();
	}

	function blurThumb(entry: SavedEntry): boolean {
		if (!entry.nsfw) return false;
		return IS_IOS || $prefs.blurNsfw;
	}

	function remove(entry: SavedEntry, from: Collection) {
		haptic();
		if (from === 'private') {
			privatePosts.remove(entry.id);
			const { id, savedAt, ...meta } = entry;
			pushToast('Removed from the private folder', {
				action: { label: 'Undo', onClick: () => privatePosts.add(id, meta, savedAt) }
			});
			return;
		}
		saved.unsave(entry.id);
		pushToast('Removed from saved', {
			action: { label: 'Undo', onClick: () => saved.save(entry.id, entry) }
		});
	}

	async function move(entry: SavedEntry, to: Collection) {
		haptic();
		await movePost(entry.id, to);
		pushToast(to === 'private' ? 'Moved to the private folder' : 'Moved to Saved', {
			action: { label: 'Undo', onClick: () => void movePost(entry.id, to === 'private' ? 'saved' : 'private') }
		});
	}

	function clearAll() {
		if (tab === 'private') {
			const snapshot = [...$privatePosts.values()];
			undoableClear({
				count: snapshot.length,
				singular: 'private post',
				plural: 'private posts',
				perform: () => privatePosts.clear(),
				undo: () => {
					for (const { id, savedAt, ...meta } of snapshot) privatePosts.add(id, meta, savedAt);
				}
			});
			return;
		}
		const snapshot = [...$saved.values()];
		undoableClear({
			count: snapshot.length,
			singular: 'saved post',
			plural: 'saved posts',
			perform: () => saved.clear(),
			undo: () => {
				for (const entry of snapshot) saved.save(entry.id, entry);
			}
		});
	}

	// Saving a post keeps a copy on the phone by itself. This is for the ones
	// that have none: saved before that existed, or saved with no connection.
	let downloading = $state(new Set<string>());
	async function download(entry: SavedEntry) {
		downloading = new Set(downloading).add(entry.id);
		const ok = await storeOffline(entry.id);
		const next = new Set(downloading);
		next.delete(entry.id);
		downloading = next;
		if (!ok) pushToast("Couldn't download that post. Check your connection.", { key: 'offline-download' });
	}

	let canClear = $derived(tab === 'saved' ? $saved.size > 0 : showPrivate && privateEntries.length > 0);
	let subtitle = $derived(
		tab === 'saved'
			? `${$saved.size} ${$saved.size === 1 ? 'post' : 'posts'}`
			: showPrivate
				? `${privateEntries.length} private`
				: 'Private folder'
	);
</script>

<TopAppBar title="Saved" {subtitle}>
	{#snippet actions()}
		{#if canClear}
			<button class="clear" onclick={clearAll}>Clear all</button>
		{/if}
	{/snippet}
</TopAppBar>

<Tabs
	tabs={[
		{ value: 'saved', label: 'Saved', count: $saved.size },
		{ value: 'private', label: 'Private' }
	]}
	bind:value={tab}
	onchange={pickTab}
/>

{#snippet list(items: SavedEntry[], where: Collection)}
	<ul class="list">
		{#each items as entry (entry.id)}
			<li class="row">
				<button class="thumb" onclick={() => openPostLayer(entry.id)} aria-label="Open post">
					{#if entry.thumbnail}
						<img src={entry.thumbnail} alt="" referrerpolicy="no-referrer" class:blur={blurThumb(entry)} />
					{:else}
						<Icon name="bookmark" size={20} />
					{/if}
				</button>
				<div class="info">
				<button class="body" onclick={() => openPostLayer(entry.id)}>
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
				<!-- Every action in words. Three bare icons here left it unclear
				     which one unsaved, which one moved, and whether the post was
				     on the phone at all. -->
				<div class="chips">
					{#if $offlineIds.has(entry.id)}
						<span class="chip done"><Icon name="check" size={14} /> Offline</span>
					{:else if IS_NATIVE}
						<button class="chip" onclick={() => download(entry)} disabled={downloading.has(entry.id)}>
							<Icon name="download" size={14} />
							{downloading.has(entry.id) ? 'Downloading' : 'Download'}
						</button>
					{/if}
					{#if where === 'saved'}
						<button class="chip" onclick={() => move(entry, 'private')}><Icon name="lock" size={14} /> Make private</button>
					{:else}
						<button class="chip" onclick={() => move(entry, 'saved')}><Icon name="bookmark" size={14} /> Move to Saved</button>
					{/if}
					<button class="chip" onclick={() => remove(entry, where)}><Icon name="close" size={14} /> Remove</button>
				</div>
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

{#if tab === 'saved'}
	{#if entries.length === 0}
		<EmptyState title="No saved posts" body="Tap the bookmark icon on any post to save it. Saved posts are kept on your phone, so they open without a connection." />
	{:else}
		{@render list(entries, 'saved')}
	{/if}
{:else if !showPrivate}
	<div class="locked">
		<div class="lock-badge"><Icon name="lock" size={30} /></div>
		<div class="locked-title">Private folder</div>
		<div class="locked-body">Locked with your fingerprint or your phone's screen lock.</div>
		<button class="unlock" onclick={() => void unlockPrivate()}>Unlock</button>
	</div>
{:else if privateEntries.length === 0}
	<EmptyState
		title="Nothing private yet"
		body="Choose Make private on a saved post, or hold any post and choose Save to private folder. Private posts stay out of the Saved list and out of every backup."
	/>
{:else}
	<p class="private-note">
		<Icon name="lock" size={14} />
		<span>
			{locks || $prefs.lockScope === 'app' ? lockNote : 'Not locked. Turn a lock on in Settings.'}
			Not included in backups.
		</span>
	</p>
	{@render list(privateEntries, 'private')}
{/if}

<style>
	.clear {
		padding: 6px 12px;
		font: inherit;
		font-size: var(--type-secondary);
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
		align-items: flex-start;
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
		font-size: var(--type-body);
		font-weight: var(--weight-title);
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		color: var(--md-sys-color-on-surface);
	}
	.meta {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.dot {
		opacity: 0.6;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 28px;
		padding: 0 10px 0 8px;
		border-radius: 14px;
		font: inherit;
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		background: var(--md-sys-color-surface-container-high);
	}
	.chip:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.chip:disabled {
		opacity: 0.6;
	}
	/* A state, not a button: the post is on the phone. */
	.chip.done {
		background: none;
		padding-left: 0;
		color: var(--md-sys-color-primary);
		font-weight: var(--weight-title);
	}
	.locked {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 72px 32px 32px;
		text-align: center;
	}
	.lock-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		border-radius: 32px;
		margin-bottom: 8px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.locked-title {
		font-size: var(--type-headline);
		font-weight: var(--weight-heading);
	}
	.locked-body {
		font-size: var(--type-secondary);
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
	}
	.unlock {
		margin-top: 16px;
		padding: 10px 28px;
		border-radius: 22px;
		font: inherit;
		font-weight: var(--weight-title);
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.private-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 10px 14px;
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
</style>
