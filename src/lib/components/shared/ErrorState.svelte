<script lang="ts">
	// The one page-level error bar. Eight pages each carried their own — some
	// with a Retry, some without, three different button paddings. Feed-internal
	// states (load-more failed, caught up, end of feed) live in FeedList; they're
	// inline in the list flow and a different thing.
	interface Props {
		message: string;
		onRetry?: () => void;
	}

	let { message, onRetry }: Props = $props();
</script>

<div class="error" role="alert">
	<span class="msg">{message}</span>
	{#if onRetry}
		<button class="retry" onclick={onRetry}>Retry</button>
	{/if}
</div>

<style>
	.error {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
		font-size: var(--type-body);
		line-height: 1.4;
	}
	.msg {
		flex: 1;
		min-width: 0;
	}
	.retry {
		flex: none;
		padding: 6px 14px;
		border-radius: 16px;
		background: var(--md-sys-color-on-error);
		color: var(--md-sys-color-error);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
	}
	.retry:active {
		opacity: 0.85;
	}
</style>
