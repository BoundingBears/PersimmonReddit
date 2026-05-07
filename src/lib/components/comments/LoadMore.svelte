<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { getMoreChildren } from '$lib/reddit/endpoints';
	import type { CommentNode, MoreStub } from '$lib/reddit/types';

	interface Props {
		stub: MoreStub;
		linkFullId: string;
		onLoaded: (replacement: CommentNode[]) => void;
	}

	let { stub, linkFullId, onLoaded }: Props = $props();
	let loading = $state(false);
	let error = $state<string | null>(null);

	const BATCH_SIZE = 25;
	let remaining = $derived(Math.max(0, stub.count - BATCH_SIZE));
	let toLoadCount = $derived(Math.min(BATCH_SIZE, stub.count));

	async function load() {
		if (loading) return;
		const slice = stub.childIds.slice(0, BATCH_SIZE);
		const rest = stub.childIds.slice(BATCH_SIZE);
		loading = true;
		error = null;
		try {
			const r = await getMoreChildren(linkFullId, slice, 'best');
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			// Build the replacement: loaded comments + (if any IDs remain) a
			// fresh "more" stub the user can tap again to load the next batch.
			const replacement: CommentNode[] = [...r.data];
			if (rest.length > 0) {
				replacement.push({
					kind: 'more',
					id: stub.id,
					parentFullId: stub.parentFullId,
					count: rest.length,
					childIds: rest,
					depth: stub.depth
				});
			}
			onLoaded(replacement);
		} catch (e) {
			console.error('morechildren load failed', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<button class="more" onclick={load} disabled={loading} style:padding-left="{stub.depth * 12 + 12}px">
	<Icon name="add" size={16} />
	{#if loading}
		Loading…
	{:else if error}
		Failed: {error} — tap to retry
	{:else if remaining > 0}
		Load {toLoadCount} more (of {stub.count})
	{:else}
		{stub.count} more {stub.count === 1 ? 'reply' : 'replies'}
	{/if}
</button>

<style>
	.more {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 8px 12px;
		text-align: left;
		font-size: 13px;
		color: var(--md-sys-color-primary);
		font-weight: 500;
	}
	.more:active {
		background: var(--md-sys-color-surface-container);
	}
	.more:disabled {
		opacity: 0.6;
	}
</style>
