<script lang="ts">
	import Skeleton from '$lib/components/shared/Skeleton.svelte';

	// Approximates the post-detail layout (header + media + a few comments) so
	// opening a post doesn't flash a blank screen before content arrives.
	interface Props {
		comments?: number;
	}
	let { comments = 4 }: Props = $props();
</script>

<div class="wrap" aria-hidden="true">
	<div class="post">
		<div class="meta">
			<Skeleton width={90} height={12} radius={6} />
			<Skeleton width={60} height={12} radius={6} />
		</div>
		<Skeleton height={22} width="92%" radius={6} />
		<Skeleton height={22} width="70%" radius={6} />
		<Skeleton height={220} radius={12} />
		<div class="actions">
			<Skeleton width={56} height={16} radius={8} />
			<Skeleton width={56} height={16} radius={8} />
			<Skeleton width={56} height={16} radius={8} />
		</div>
	</div>

	<div class="comments">
		{#each Array(comments) as _, i (i)}
			<div class="comment" style:margin-left="{(i % 3) * 16}px">
				<Skeleton width={120} height={11} radius={5} />
				<Skeleton width="95%" height={12} radius={6} />
				<Skeleton width="80%" height={12} radius={6} />
			</div>
		{/each}
	</div>
</div>

<style>
	.post {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border-bottom: 8px solid var(--md-sys-color-surface-container-low);
	}
	.meta {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.actions {
		display: flex;
		gap: 16px;
		margin-top: 4px;
	}
	.comments {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px 14px;
	}
	.comment {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
