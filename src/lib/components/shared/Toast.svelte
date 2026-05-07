<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';

	function runAction(toastId: number, onClick: () => void) {
		try {
			onClick();
		} finally {
			dismissToast(toastId);
		}
	}
</script>

<div class="stack" aria-live="polite" aria-atomic="true">
	{#each $toasts as t (t.id)}
		<div class="toast" in:fly={{ y: 20, duration: 180 }} out:fly={{ y: 20, duration: 140 }}>
			<button
				type="button"
				class="message"
				onclick={() => dismissToast(t.id)}
				aria-label="Dismiss"
			>
				{t.message}
			</button>
			{#if t.action}
				<button
					type="button"
					class="action"
					onclick={() => runAction(t.id, t.action!.onClick)}
				>
					{t.action.label}
				</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		left: 50%;
		bottom: calc(80px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		z-index: 150;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 16px;
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		border-radius: 20px;
		font-size: 13px;
		max-width: min(420px, 90vw);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
	}
	.toast :global(.action) {
		/* Pull the action chip slightly into the right padding so the toast
		   feels balanced when it has both message + action. */
		margin-right: -8px;
	}
	.message {
		flex: 1;
		min-width: 0;
		padding: 6px 0;
		text-align: center;
		color: inherit;
		background: transparent;
		border: 0;
		font: inherit;
		font-size: 13px;
	}
	.action {
		flex: none;
		padding: 6px 12px;
		border-radius: 14px;
		color: var(--md-sys-color-inverse-primary);
		background: transparent;
		border: 0;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.action:active {
		background: rgba(255, 255, 255, 0.12);
	}
</style>
