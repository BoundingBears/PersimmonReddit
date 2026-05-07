<script lang="ts">
	interface Props {
		height?: number | string;
		width?: number | string;
		radius?: number;
	}

	let { height = 16, width = '100%', radius = 8 }: Props = $props();

	let h = $derived(typeof height === 'number' ? `${height}px` : height);
	let w = $derived(typeof width === 'number' ? `${width}px` : width);
</script>

<div class="skel" style:height={h} style:width={w} style:border-radius="{radius}px"></div>

<style>
	.skel {
		background: linear-gradient(
			90deg,
			var(--md-sys-color-surface-container-low) 0%,
			var(--md-sys-color-surface-container-high) 50%,
			var(--md-sys-color-surface-container-low) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skel {
			animation: none;
		}
	}
</style>
