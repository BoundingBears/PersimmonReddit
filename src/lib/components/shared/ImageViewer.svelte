<script lang="ts">
	import { onMount } from 'svelte';
	import { CapacitorHttp } from '@capacitor/core';
	import { Filesystem, Directory } from '@capacitor/filesystem';
	import { Share } from '@capacitor/share';
	import { Browser } from '@capacitor/browser';
	import Icon from './Icon.svelte';
	import { viewerState, closeViewer, installViewerHistoryListener } from '$lib/stores/imageViewer';
	import { IS_NATIVE } from '$lib/utils/platform';

	onMount(() => installViewerHistoryListener());

	let saving = $state(false);
	let saveStatus = $state<string | null>(null);

	function fileNameFromUrl(url: string): string {
		try {
			const u = new URL(url);
			const last = u.pathname.split('/').filter(Boolean).pop() ?? 'image';
			// Strip query suffixes glued onto extensions (?width=...&fmt=...)
			return last.split('?')[0].split('#')[0] || `persimmon-${Date.now()}`;
		} catch {
			return `persimmon-${Date.now()}`;
		}
	}

	async function save() {
		if (!$viewerState || saving) return;
		saving = true;
		saveStatus = 'Saving…';
		try {
			if (!IS_NATIVE) {
				// Web fallback: open in a new tab so the user can right-click → save.
				window.open($viewerState.url, '_blank', 'noopener');
				saveStatus = 'Opened in browser';
				return;
			}
			// Fetch raw bytes via native HTTP (CapacitorHttp can return base64 for blobs).
			const res = await CapacitorHttp.get({
				url: $viewerState.url,
				headers: { Referer: 'https://www.reddit.com' },
				responseType: 'blob'
			});
			if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
			// CapacitorHttp returns base64 in `data` for blob responseType.
			const filename = fileNameFromUrl($viewerState.url);
			await Filesystem.writeFile({
				path: `Persimmon/${filename}`,
				data: res.data as string,
				directory: Directory.Documents,
				recursive: true
			});
			saveStatus = `Saved to Documents/Persimmon/${filename}`;
		} catch (e) {
			console.error('image save failed', e);
			saveStatus = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			saving = false;
			setTimeout(() => (saveStatus = null), 3000);
		}
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
		overflow: auto;
		touch-action: pinch-zoom;
	}
	.media img,
	.media video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
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
