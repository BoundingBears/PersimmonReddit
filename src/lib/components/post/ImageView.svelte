<script lang="ts">
	import { prefs } from '$lib/stores/prefs';
	import { openImage } from '$lib/stores/imageViewer';

	interface Props {
		/** What to show inline. */
		url: string;
		/** The original, opened in the zoomable viewer. Defaults to `url`. */
		fullUrl?: string;
		/** Width times height of the original, when known. */
		fullPixels?: number;
		width?: number;
		height?: number;
		nsfw?: boolean;
		alt?: string;
	}

	let { url, fullUrl, fullPixels, width, height, nsfw = false, alt = '' }: Props = $props();
	let revealed = $state(false);
	let blurred = $derived(nsfw && $prefs.blurNsfw && !revealed);

	function open() {
		if (blurred) {
			revealed = true;
			return;
		}
		openImage(fullUrl ?? url, alt, url, fullPixels);
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
		font-weight: var(--weight-title);
	}
</style>
