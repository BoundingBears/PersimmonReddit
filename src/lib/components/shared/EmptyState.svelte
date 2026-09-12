<script lang="ts">
	// The one page-level "nothing here" block. Six pages had each grown their own
	// copy — two markup shapes, two type scales, three paddings — all saying the
	// same thing. Inline one-liners (a drawer section, a comment tree) stay inline;
	// this is for a page whose whole body is empty.
	interface Props {
		title: string;
		body?: string;
		actionLabel?: string;
		/** Link-style action. Takes precedence over onAction. */
		actionHref?: string;
		onAction?: () => void;
	}

	let { title, body, actionLabel, actionHref, onAction }: Props = $props();
</script>

<div class="empty">
	<div class="title">{title}</div>
	{#if body}
		<div class="body">{body}</div>
	{/if}
	{#if actionLabel}
		{#if actionHref}
			<a class="cta" href={actionHref}>{actionLabel}</a>
		{:else}
			<button class="cta" onclick={onAction}>{actionLabel}</button>
		{/if}
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding: 48px 24px;
		text-align: center;
	}
	.title {
		font-size: var(--type-title);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface);
	}
	.body {
		font-size: var(--type-body);
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
		max-width: 32ch;
	}
	.cta {
		display: inline-block;
		margin-top: var(--space-sm);
		padding: 10px 20px;
		border-radius: 24px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--weight-title);
	}
	.cta:active {
		opacity: 0.85;
	}
</style>
