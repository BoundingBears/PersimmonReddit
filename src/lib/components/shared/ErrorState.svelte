<script lang="ts">
	// The one "this didn't load" block, for a page (or the comments under a
	// post) with nothing else to show. Feed-internal states (load-more failed,
	// caught up, end of feed) live in FeedList; they're inline in the list flow
	// and a different thing.
	//
	// It says what did not load, and why in a sentence (failure.ts writes
	// those), with a way to ask again.
	import Icon from './Icon.svelte';

	interface Props {
		title?: string;
		message: string;
		onRetry?: () => void;
	}

	let { title, message, onRetry }: Props = $props();
</script>

<div class="error" role="alert">
	<span class="icon"><Icon name="cloud_off" size={28} /></span>
	{#if title}<div class="title">{title}</div>{/if}
	<div class="msg">{message}</div>
	{#if onRetry}
		<button class="btn" onclick={onRetry}>Try again</button>
	{/if}
</div>

<style>
	.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding: 36px 24px;
		text-align: center;
	}
	.icon {
		color: var(--md-sys-color-on-surface-variant);
		line-height: 0;
	}
	.title {
		font-size: var(--type-title);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface);
	}
	.msg {
		font-size: var(--type-body);
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
		max-width: 34ch;
	}
	.btn {
		margin-top: var(--space-sm);
		padding: 10px 18px;
		border-radius: 24px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
	}
	.btn:active {
		opacity: 0.85;
	}
</style>
