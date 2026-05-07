<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		distance: number;
		refreshing: boolean;
		threshold?: number;
		max?: number;
	}

	let { distance, refreshing, threshold = 80, max = 140 }: Props = $props();

	let opacity = $derived(Math.min(1, distance / threshold));
	let rotation = $derived(refreshing ? 0 : distance * 3);
	let armed = $derived(!refreshing && distance >= threshold);
	let translate = $derived(Math.min(distance - 48, max - 48));
</script>

{#if distance > 0 || refreshing}
	<div
		class="indicator"
		class:armed
		class:refreshing
		style:transform="translate(-50%, {translate}px)"
		style:opacity
	>
		<span style:transform="rotate({rotation}deg)" class="icon-wrap">
			<Icon name="refresh" size={22} />
		</span>
	</div>
{/if}

<style>
	.indicator {
		position: absolute;
		top: 8px;
		left: 50%;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		pointer-events: none;
		transition: opacity 120ms ease-out;
	}
	.indicator.armed {
		color: var(--md-sys-color-primary);
		background: var(--md-sys-color-primary-container);
	}
	.indicator.refreshing .icon-wrap {
		animation: spin 900ms linear infinite;
	}
	.icon-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: transform 80ms linear;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
