<script lang="ts">
	import Skeleton from '$lib/components/shared/Skeleton.svelte';

	interface Props {
		count?: number;
	}

	let { count = 4 }: Props = $props();
</script>

<div class="list">
	{#each Array(count) as _, i (i)}
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
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
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
</style>
