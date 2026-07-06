<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { MediaVideo } from '$lib/reddit/types';
	import { prefs } from '$lib/stores/prefs';
	import { IS_NATIVE } from '$lib/utils/platform';
	import { fetchTextNative, fetchRangeNative } from '$lib/reddit/client';
	import Icon from '$lib/components/shared/Icon.svelte';

	interface Props {
		video: MediaVideo;
		poster?: string;
	}

	let { video, poster }: Props = $props();
	let wrapEl: HTMLDivElement | undefined = $state();
	let videoEl: HTMLVideoElement | undefined = $state();
	let hls: { destroy: () => void } | undefined;
	let mse: MediaSource | undefined;

	// Custom-controls state. We hide the native controls entirely (their mute
	// hit-area lingers after they fade — a ghost tap target) and draw our own,
	// which are removed from the DOM when hidden, so there's no phantom tap.
	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let muted = $state(false);
	let controlsShown = $state(true);
	let isFullscreen = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	// Spinner while the element has no playable data yet / is re-buffering.
	let loading = $state(true);
	// Set on destroy to stop the progressive stream pump mid-flight.
	let streamAbort = false;

	// Audio: when muxing works the <video> carries its own track; otherwise a
	// separate synced <audio> provides sound. Either way `muted` drives both.
	let muxed = $state(false);
	let audioEl: HTMLAudioElement | undefined;
	const cleanups: Array<() => void> = [];

	function applyMute() {
		if (videoEl) videoEl.muted = muxed ? muted : true; // video track is silent in fallback
		if (audioEl) audioEl.muted = muted;
	}

	// ---------- Mux video + audio into one element (preferred) ----------
	type Track = { url: string; codecs: string };

	function baseName(url: string): string | null {
		try {
			return new URL(url).pathname.split('/').pop()?.split('?')[0] ?? null;
		} catch {
			return null;
		}
	}

	function parseTracks(xml: string): { video: Track; audio: Track } | null {
		try {
			const doc = new DOMParser().parseFromString(xml, 'text/xml');
			const sets = Array.from(doc.getElementsByTagNameNS('*', 'AdaptationSet'));
			const baseUrlOf = (el: Element): string | null =>
				el.getElementsByTagNameNS('*', 'BaseURL')[0]?.textContent?.trim() ?? null;
			const pick = (kind: 'video' | 'audio'): Track | null => {
				const set = sets.find((s) => {
					const ct = s.getAttribute('contentType') ?? '';
					const mt = s.getAttribute('mimeType') ?? '';
					return ct === kind || mt.startsWith(kind + '/');
				});
				if (!set) return null;
				const reps = Array.from(set.getElementsByTagNameNS('*', 'Representation'));
				if (!reps.length) return null;
				let rep: Element = reps[0];
				if (kind === 'video' && video.fallbackUrl) {
					const fname = baseName(video.fallbackUrl);
					rep = reps.find((r) => baseUrlOf(r) === fname) ?? reps[reps.length - 1];
				}
				const codecs = rep.getAttribute('codecs') ?? set.getAttribute('codecs');
				const bu = baseUrlOf(rep);
				if (!codecs || !bu) return null;
				return { url: new URL(bu, video.dashUrl).toString(), codecs };
			};
			const v = pick('video');
			const a = pick('audio');
			return v && a ? { video: v, audio: a } : null;
		} catch {
			return null;
		}
	}

	function appendBuffer(sb: SourceBuffer, buf: ArrayBuffer): Promise<void> {
		return new Promise((resolve, reject) => {
			sb.addEventListener('updateend', () => resolve(), { once: true });
			sb.addEventListener('error', () => reject(new Error('append error')), { once: true });
			sb.appendBuffer(buf);
		});
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((r) => setTimeout(r, ms));
	}

	// Seconds of already-buffered media ahead of the current playhead.
	function bufferedAhead(): number {
		const v = videoEl;
		if (!v) return 0;
		const t = v.currentTime;
		const b = v.buffered;
		for (let i = 0; i < b.length; i++) {
			if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.25) return b.end(i) - t;
		}
		return 0;
	}

	// Chunk size per ranged request and how far ahead of the playhead we keep
	// buffered before pausing the download (so we don't pull the whole clip up
	// front — or at all, if the user scrolls away).
	const CHUNK = 512 * 1024;
	const TARGET_AHEAD_S = 12;

	// Progressive mux: pull the video and audio tracks in ranged chunks and
	// append them to MediaSource as they arrive, so playback can begin after the
	// first fragment instead of waiting for the whole file. Resolves as soon as
	// there's enough buffered to start; the rest streams in the background,
	// throttled to a bounded lookahead.
	async function setupMux(): Promise<boolean> {
		if (!video.dashUrl || typeof MediaSource === 'undefined' || !videoEl) return false;
		const xml = await fetchTextNative(video.dashUrl);
		if (!xml) return false;
		const tracks = parseTracks(xml);
		if (!tracks) return false;
		const vMime = `video/mp4; codecs="${tracks.video.codecs}"`;
		const aMime = `audio/mp4; codecs="${tracks.audio.codecs}"`;
		if (!MediaSource.isTypeSupported(vMime) || !MediaSource.isTypeSupported(aMime)) return false;

		const ms = new MediaSource();
		mse = ms;
		videoEl.src = URL.createObjectURL(ms);
		await new Promise<void>((resolve, reject) => {
			ms.addEventListener('sourceopen', () => resolve(), { once: true });
			setTimeout(() => reject(new Error('sourceopen timeout')), 6000);
		});
		const vSB = ms.addSourceBuffer(vMime);
		const aSB = ms.addSourceBuffer(aMime);

		let vOff = 0;
		let aOff = 0;
		let vTotal: number | null = null;
		let aTotal: number | null = null;
		let vEof = false;
		let aEof = false;
		let started = false;
		let resolveReady!: () => void;
		const ready = new Promise<void>((r) => (resolveReady = r));

		// Fetch + append one chunk of a track; report the new offset, learned
		// total length, and whether we've reached the end.
		async function pump(
			url: string,
			sb: SourceBuffer,
			off: number,
			total: number | null
		): Promise<{ off: number; total: number | null; eof: boolean }> {
			const res = await fetchRangeNative(url, off, off + CHUNK - 1);
			if (!res || res.bytes.byteLength === 0) return { off, total, eof: true };
			const t = total ?? res.total;
			await appendBuffer(sb, res.bytes);
			const next = off + res.bytes.byteLength;
			const eof = (t != null && next >= t) || res.bytes.byteLength < CHUNK;
			return { off: next, total: t, eof };
		}

		(async () => {
			try {
				while (!streamAbort && !(vEof && aEof)) {
					// Throttle once we're comfortably ahead of the playhead.
					if (started && vOff > 0 && bufferedAhead() >= TARGET_AHEAD_S) {
						await sleep(300);
						continue;
					}
					if (!vEof) {
						const r = await pump(tracks.video.url, vSB, vOff, vTotal);
						vOff = r.off;
						vTotal = r.total;
						vEof = r.eof;
					}
					if (streamAbort) break;
					if (!aEof) {
						const r = await pump(tracks.audio.url, aSB, aOff, aTotal);
						aOff = r.off;
						aTotal = r.total;
						aEof = r.eof;
					}
					// Enough buffered to begin once both tracks have a first chunk.
					if (!started && vOff > 0 && aOff > 0) {
						started = true;
						resolveReady();
					}
				}
				if (!streamAbort && ms.readyState === 'open') ms.endOfStream();
			} catch {
				// stream error — stop; if nothing was buffered, onMount's caller
				// falls back to a plain <video> src below.
			} finally {
				resolveReady();
			}
		})();

		await ready;
		return started;
	}

	// ---------- Fallback: video-only MP4 + separate synced <audio> ----------
	function audioCandidates(fallbackUrl: string): string[] {
		try {
			const u = new URL(fallbackUrl);
			const base = u.origin + u.pathname.replace(/\/[^/]*$/, '/');
			return ['DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_AUDIO_256.mp4', 'DASH_AUDIO_32.mp4', 'DASH_audio.mp4', 'audio'].map(
				(name) => base + name
			);
		} catch {
			return [];
		}
	}

	function attachAudio(candidates: string[], i = 0): void {
		if (i >= candidates.length || !videoEl) return;
		const a = new Audio();
		a.preload = 'auto';
		const onErr = () => {
			a.removeEventListener('error', onErr);
			a.removeEventListener('loadedmetadata', onOk);
			attachAudio(candidates, i + 1);
		};
		const onOk = () => {
			a.removeEventListener('error', onErr);
			a.removeEventListener('loadedmetadata', onOk);
			audioEl = a;
			applyMute();
			syncAudio(a);
		};
		a.addEventListener('error', onErr);
		a.addEventListener('loadedmetadata', onOk);
		a.src = candidates[i];
		a.load();
	}

	function syncAudio(a: HTMLAudioElement): void {
		const v = videoEl;
		if (!v) return;
		const on = (ev: string, fn: () => void) => {
			v.addEventListener(ev, fn);
			cleanups.push(() => v.removeEventListener(ev, fn));
		};
		on('play', () => {
			a.currentTime = v.currentTime;
			a.play().catch(() => undefined);
		});
		on('pause', () => a.pause());
		on('seeking', () => (a.currentTime = v.currentTime));
		on('timeupdate', () => {
			if (Math.abs(a.currentTime - v.currentTime) > 0.3) a.currentTime = v.currentTime;
		});
	}

	function fallbackPlay(): void {
		if (!videoEl || !video.fallbackUrl) return;
		videoEl.src = video.fallbackUrl;
		if (!video.isGif) attachAudio(audioCandidates(video.fallbackUrl));
	}

	// ---------- Custom controls ----------
	function fmt(t: number): string {
		if (!isFinite(t)) return '0:00';
		const m = Math.floor(t / 60);
		const s = Math.floor(t % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function scheduleHide() {
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (playing) controlsShown = false;
		}, 3000);
	}

	function showControls() {
		controlsShown = true;
		scheduleHide();
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) videoEl.play().catch(() => undefined);
		else videoEl.pause();
		showControls();
	}

	function onTapVideo() {
		if (controlsShown) controlsShown = false;
		else showControls();
	}

	function toggleMute() {
		muted = !muted;
		applyMute();
		showControls();
	}

	function seek(e: Event) {
		const t = Number((e.target as HTMLInputElement).value);
		if (videoEl) videoEl.currentTime = t;
		currentTime = t;
		showControls();
	}

	async function toggleFullscreen() {
		showControls();
		try {
			if (!document.fullscreenElement) await wrapEl?.requestFullscreen();
			else await document.exitFullscreen();
		} catch {
			// ignore
		}
	}

	onMount(async () => {
		if (!videoEl) return;
		muted = $prefs.autoplayVideos;

		if (IS_NATIVE) {
			let ok = false;
			try {
				ok = await setupMux();
			} catch {
				ok = false;
			}
			muxed = ok;
			if (!ok && videoEl) fallbackPlay();
		} else if (video.hlsUrl && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
			videoEl.src = video.hlsUrl;
			muxed = true;
		} else if (video.hlsUrl) {
			const { default: Hls } = await import('hls.js');
			if (!videoEl) return;
			if (Hls.isSupported()) {
				const instance = new Hls({ enableWorker: true });
				instance.loadSource(video.hlsUrl);
				instance.attachMedia(videoEl);
				hls = instance;
				muxed = true; // HLS carries audio in-stream
			} else if (video.fallbackUrl) {
				videoEl.src = video.fallbackUrl;
			}
		} else if (video.fallbackUrl) {
			videoEl.src = video.fallbackUrl;
			muxed = true;
		}

		applyMute();
		if ($prefs.autoplayVideos) {
			videoEl.play().catch(() => undefined);
		}

		const onFs = () => (isFullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		cleanups.push(() => document.removeEventListener('fullscreenchange', onFs));
	});

	onDestroy(() => {
		streamAbort = true; // stop the progressive pump so it doesn't keep fetching
		if (hideTimer) clearTimeout(hideTimer);
		hls?.destroy();
		for (const fn of cleanups) fn();
		if (audioEl) {
			audioEl.pause();
			audioEl.src = '';
		}
		if (mse && mse.readyState === 'open') {
			try {
				mse.endOfStream();
			} catch {
				// ignore
			}
		}
	});
</script>

<div class="wrap" bind:this={wrapEl} class:fs={isFullscreen}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<video
		bind:this={videoEl}
		{poster}
		playsinline
		preload="metadata"
		loop={video.isGif}
		onclick={onTapVideo}
		onplay={() => {
			playing = true;
			scheduleHide();
		}}
		onpause={() => {
			playing = false;
			controlsShown = true;
		}}
		onwaiting={() => (loading = true)}
		onplaying={() => (loading = false)}
		oncanplay={() => (loading = false)}
		ontimeupdate={() => (currentTime = videoEl?.currentTime ?? 0)}
		onloadedmetadata={() => (duration = videoEl?.duration ?? 0)}
		ondurationchange={() => (duration = videoEl?.duration ?? 0)}
	></video>

	{#if loading}
		<div class="spinner" aria-label="Loading video"></div>
	{/if}

	{#if !video.isGif && controlsShown}
		<button class="center" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
			<Icon name={playing ? 'pause' : 'play_arrow'} size={40} />
		</button>

		<div class="bar">
			<button class="cbtn" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
				<Icon name={playing ? 'pause' : 'play_arrow'} size={22} />
			</button>
			<span class="time">{fmt(currentTime)} / {fmt(duration)}</span>
			<input
				class="seek"
				type="range"
				min="0"
				max={duration || 0}
				step="0.1"
				value={currentTime}
				oninput={seek}
				aria-label="Seek"
			/>
			<button class="cbtn" onclick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
				<Icon name={muted ? 'volume_off' : 'volume_up'} size={22} />
			</button>
			<button class="cbtn" onclick={toggleFullscreen} aria-label="Fullscreen">
				<Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} size={22} />
			</button>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		background: #000;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Uniform cap so every video — portrait or landscape — fits on screen
		   without scrolling, and leaves room for the action bar below it.
		   Taller-than-wide videos letterbox instead of pushing the page down. */
		max-height: 50vh;
	}
	.wrap.fs {
		height: 100%;
		max-height: none;
	}
	video {
		display: block;
		max-width: 100%;
		max-height: 50vh;
		object-fit: contain;
		background: #000;
	}
	.wrap.fs video {
		max-height: 100%;
	}
	.center {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		border-radius: 32px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
	}
	.spinner {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 40px;
		height: 40px;
		margin: -20px 0 0 -20px;
		border: 3px solid rgba(255, 255, 255, 0.25);
		border-top-color: #fff;
		border-radius: 50%;
		animation: video-spin 0.8s linear infinite;
		pointer-events: none;
	}
	@keyframes video-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
	}
	.cbtn {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 18px;
		color: #fff;
	}
	.cbtn:active {
		background: rgba(255, 255, 255, 0.15);
	}
	.time {
		flex: none;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: #fff;
	}
	.seek {
		flex: 1;
		min-width: 0;
		height: 24px;
		accent-color: var(--md-sys-color-primary);
	}
</style>
