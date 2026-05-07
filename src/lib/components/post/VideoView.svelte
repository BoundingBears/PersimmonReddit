<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { MediaVideo } from '$lib/reddit/types';
	import { prefs } from '$lib/stores/prefs';

	interface Props {
		video: MediaVideo;
		poster?: string;
	}

	let { video, poster }: Props = $props();
	let videoEl: HTMLVideoElement | undefined = $state();
	// hls.js is heavy (~260 KB); we only need it when actually playing a
	// v.redd.it stream. Dynamic import keeps it out of the home-feed bundle.
	let hls: { destroy: () => void } | undefined;

	onMount(async () => {
		if (!videoEl) return;
		const src = video.hlsUrl;

		if (src && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
			// Native HLS (Safari, iOS webview, some Android WebViews) — no JS player needed.
			videoEl.src = src;
		} else if (src) {
			// Lazy-load hls.js on demand.
			const { default: Hls } = await import('hls.js');
			if (!videoEl) return; // unmounted while loading
			if (Hls.isSupported()) {
				const instance = new Hls({ enableWorker: true });
				instance.loadSource(src);
				instance.attachMedia(videoEl);
				hls = instance;
			} else if (video.fallbackUrl) {
				videoEl.src = video.fallbackUrl;
			}
		} else if (video.fallbackUrl) {
			videoEl.src = video.fallbackUrl;
		}

		if ($prefs.autoplayVideos && videoEl) {
			videoEl.muted = true;
			videoEl.play().catch(() => undefined);
		}
	});

	onDestroy(() => {
		hls?.destroy();
	});
</script>

<video
	bind:this={videoEl}
	{poster}
	controls
	playsinline
	preload="metadata"
	width={video.width || undefined}
	height={video.height || undefined}
	loop={video.isGif}
	muted={video.isGif}
></video>

<style>
	video {
		display: block;
		width: 100%;
		max-height: 80vh;
		background: #000;
	}
</style>
