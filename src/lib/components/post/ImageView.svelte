<script lang="ts">
	import { prefs } from '$lib/stores/prefs';
	import { openImage } from '$lib/stores/imageViewer';

	interface Props {
		url: string;
		width?: number;
		height?: number;
		nsfw?: boolean;
		alt?: string;
	}

	let { url, width, height, nsfw = false, alt = '' }: Props = $props();
	let revealed = $state(false);
	let blurred = $derived(nsfw && $prefs.blurNsfw && !revealed);

	function open() {
		if (blurred) {
			revealed = true;
			return;
		}
		openImage(url, alt);
	}
</script>

<div class="wrap" class:blurred>
	<button class="hit" onclick={open} aria-label="Open image">
		<img
			src={url}
			{alt}
			loading="lazy"
			referrerpolicy="no-referrer"
			width={width || undefined}
			height={height || undefined}
		/>
	</button>
	{#if blurred}
		<button class="reveal" onclick={() => (revealed = true)}>Tap to reveal</button>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		display: flex;
		justify-content: center;
		background: var(--md-sys-color-surface-container-low);
	}
	.hit {
		display: block;
		width: 100%;
		padding: 0;
		background: none;
		text-align: center;
	}
	img {
		display: block;
		max-width: 100%;
		max-height: 80vh;
		height: auto;
		object-fit: contain;
		margin: 0 auto;
	}
	.blurred img {
		filter: blur(48px);
	}
	.reveal {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 8px 16px;
		border-radius: 24px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font-weight: 500;
	}
</style>
