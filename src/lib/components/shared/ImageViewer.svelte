<script lang="ts">
	import { onMount } from 'svelte';
	import { Share } from '@capacitor/share';
	import { Browser } from '@capacitor/browser';
	import Icon from './Icon.svelte';
	import { viewerState, closeViewer, installViewerHistoryListener } from '$lib/stores/imageViewer';
	import { IS_NATIVE } from '$lib/utils/platform';
	import { saveImage } from '$lib/utils/saveImage';
	import { pinchZoom } from '$lib/actions/pinchZoom';

	onMount(() => installViewerHistoryListener());

	// Lock body scroll while the viewer is open so the underlying feed/post
	// can't be scrolled or interacted with through the scrim.
	$effect(() => {
		if (!$viewerState) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	let saving = $state(false);
	let saveStatus = $state<string | null>(null);

	async function save() {
		if (!$viewerState || saving) return;
		saving = true;
		saveStatus = 'Saving…';
		const res = await saveImage($viewerState.url);
		saveStatus = res.message;
		saving = false;
		setTimeout(() => (saveStatus = null), 3000);
	}

	async function share() {
		if (!$viewerState) return;
		try {
			if (IS_NATIVE) {
				await Share.share({ url: $viewerState.url, dialogTitle: 'Share image' });
			} else if (navigator.share) {
				await navigator.share({ url: $viewerState.url });
			} else {
				navigator.clipboard?.writeText($viewerState.url);
				saveStatus = 'URL copied';
				setTimeout(() => (saveStatus = null), 2000);
			}
		} catch {
			// User cancelled share; ignore.
		}
	}

	async function openInBrowser() {
		if (!$viewerState) return;
		if (IS_NATIVE) {
			await Browser.open({ url: $viewerState.url });
		} else {
			window.open($viewerState.url, '_blank', 'noopener');
		}
	}

	function onScrimClick(e: MouseEvent) {
		// Only close if the click was directly on the scrim, not on the image / chrome.
		if (e.currentTarget === e.target) closeViewer();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeViewer();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if $viewerState}
	<div class="scrim" onclick={onScrimClick} role="presentation">
		<header class="bar top">
			<button class="iconbtn" onclick={closeViewer} aria-label="Close"><Icon name="close" size={24} /></button>
			<span class="spacer"></span>
			<button class="iconbtn" onclick={openInBrowser} aria-label="Open in browser"><Icon name="open_in_new" size={22} /></button>
			<button class="iconbtn" onclick={share} aria-label="Share"><Icon name="share" size={22} /></button>
			<button class="iconbtn" onclick={save} disabled={saving} aria-label="Save"><Icon name="download" size={22} /></button>
		</header>

		<div class="media">
			{#if $viewerState.kind === 'video'}
				<video src={$viewerState.url} controls autoplay playsinline></video>
			{:else}
				<img
					src={$viewerState.url}
					alt={$viewerState.alt ?? ''}
					referrerpolicy="no-referrer"
					use:pinchZoom={{ minScale: 1, maxScale: 4 }}
				/>
			{/if}
		</div>

		{#if saveStatus}
			<div class="toast">{saveStatus}</div>
		{/if}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		flex-direction: column;
		animation: fade 150ms ease-out;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px;
		padding-top: calc(8px + env(safe-area-inset-top));
		color: #fff;
	}
	.spacer {
		flex: 1;
	}
	.iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 22px;
		color: #fff;
		background: rgba(255, 255, 255, 0.06);
	}
	.iconbtn:active {
		background: rgba(255, 255, 255, 0.18);
	}
	.iconbtn:disabled {
		opacity: 0.5;
	}
	.media {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
		overflow: hidden;
	}
	.media img,
	.media video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
	}
	.media img {
		/* Pinch/pan/double-tap are all handled in JS via the pinchZoom action.
		   Disable native gesture handling so the browser doesn't fight us. */
		touch-action: none;
		transform-origin: center;
		will-change: transform;
		user-select: none;
		-webkit-user-drag: none;
	}
	.toast {
		position: absolute;
		left: 50%;
		bottom: calc(24px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		padding: 10px 16px;
		background: rgba(0, 0, 0, 0.85);
		color: #fff;
		border-radius: 20px;
		font-size: 13px;
		max-width: 80%;
		text-align: center;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
