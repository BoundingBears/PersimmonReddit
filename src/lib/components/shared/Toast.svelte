<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
</script>

<div class="stack" aria-live="polite" aria-atomic="true">
	{#each $toasts as t (t.id)}
		<button
			type="button"
			class="toast"
			onclick={() => dismissToast(t.id)}
			in:fly={{ y: 20, duration: 180 }}
			out:fly={{ y: 20, duration: 140 }}
		>
			{t.message}
		</button>
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
		padding: 10px 16px;
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		border-radius: 20px;
		font-size: 13px;
		max-width: min(420px, 80vw);
		text-align: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		font: inherit;
		font-size: 13px;
	}
</style>
