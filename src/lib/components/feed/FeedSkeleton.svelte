<script lang="ts">
	import Skeleton from '$lib/components/shared/Skeleton.svelte';
	import type { Layout } from '$lib/stores/prefs';

	interface Props {
		count?: number;
		layout?: Layout;
	}

	let { count = 4, layout = 'card' }: Props = $props();

	// Gallery shows a denser grid, so spawn more placeholder tiles than the
	// card/compact lists to fill the same vertical space.
	let n = $derived(layout === 'gallery' ? Math.max(count, 9) : count);
</script>

<div class="list" data-layout={layout} aria-hidden="true">
	{#each Array(n) as _, i (i)}
		{#if layout === 'card'}
			<article class="card">
				<div class="meta">
					<Skeleton width={70} height={12} radius={6} />
					<Skeleton width={80} height={12} radius={6} />
					<Skeleton width={50} height={12} radius={6} />
				</div>
				<Skeleton height={20} width="85%" />
				<Skeleton height={180} radius={12} />
				<div class="actions">
					<Skeleton width={50} height={14} radius={7} />
					<Skeleton width={50} height={14} radius={7} />
				</div>
			</article>
		{:else if layout === 'compact'}
			<div class="row">
				<Skeleton width={64} height={64} radius={8} />
				<div class="body">
					<Skeleton height={14} width="90%" radius={6} />
					<Skeleton height={14} width="60%" radius={6} />
					<Skeleton height={11} width={140} radius={5} />
				</div>
			</div>
		{:else}
			<div class="tile">
				<Skeleton width="100%" height="100%" radius={12} />
			</div>
		{/if}
	{/each}
</div>

<style>
	.list[data-layout='card'] {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}
	.list[data-layout='compact'] {
		display: flex;
		flex-direction: column;
	}
	.list[data-layout='gallery'] {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 4px;
		padding: 4px;
	}
	.card {
		background: var(--md-sys-color-surface-container);
		border-radius: 16px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.meta {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.actions {
		display: flex;
		gap: 16px;
	}
	.row {
		display: flex;
		gap: 12px;
		padding: 10px 14px;
		background: var(--md-sys-color-surface);
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 2px;
	}
	.tile {
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
	}
</style>
