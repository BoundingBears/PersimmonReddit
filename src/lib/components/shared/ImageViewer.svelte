<script lang="ts">
	// Fullscreen viewer for images, galleries and inline videos.
	//
	// Built around a vertical scroll-snap pager, so moving between images is
	// native scrolling: it tracks the finger, carries momentum, and snaps, all
	// on the compositor. The previous viewer kept a single <img> and swapped
	// its src on a JS-detected swipe, which meant the next picture did not
	// exist until after the gesture and arrived as a black wait.
	//
	// It pages up and down, not sideways: that is the thumb's natural stroke on
	// a phone, and the left and right screen edges belong to the system Back
	// gesture, which a sideways swipe keeps setting off. Dragging past the
	// first or last picture (or either way on a lone picture) pulls it away and
	// closes the viewer.
	//
	// Each slide shows the screen-sized copy the post already loaded, so it is
	// on screen immediately. The full-size original is fetched only when the
	// user zooms in, which is the only time its extra pixels can be seen.
	import { onMount, tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { viewerState, closeViewer, setViewerIndex, installViewerHistoryListener } from '$lib/stores/imageViewer';
	import { openExternal } from '$lib/utils/openExternal';
	import { saveImage } from '$lib/utils/saveImage';
	import { copyImage, shareImage } from '$lib/utils/imageActions';
	import { sharpCopy } from '$lib/utils/sharpImage';
	import { prefs } from '$lib/stores/prefs';
	import { pinchZoom } from '$lib/actions/pinchZoom';

	onMount(() => installViewerHistoryListener());

	// Lock body scroll while the viewer is open so the page underneath cannot
	// be scrolled through it.
	$effect(() => {
		if (!$viewerState) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	let items = $derived($viewerState?.items ?? []);
	let index = $derived($viewerState?.index ?? 0);
	let current = $derived(items[index] ?? null);
	let count = $derived(items.length);

	let pager: HTMLDivElement | undefined = $state();
	// A dismiss drag was let go and the picture is flying off; the backdrop
	// fades out behind it before the viewer is torn down.
	let closing = $state(false);
	// Tap the picture to hide the buttons and caption, tap again to bring them
	// back. Leaves nothing on screen but the image.
	let chromeHidden = $state(false);
	// The slide the pager last came to rest on. Pictures are mounted around
	// this one, not around the live index, so nothing is created, decoded or
	// torn down while a swipe is still moving.
	let settled = $state(0);
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	// How many pictures either side of it are kept ready.
	const READY = 2;
	// The sharper copy to show for a slide, once one is ready.
	let sharp = $state<Record<number, string>>({});
	const sharpening = new Set<number>();
	// Slides with a picture on screen; the rest show a spinner.
	let loaded = $state<Record<number, boolean>>({});

	// Fresh state for every open.
	let open = $derived($viewerState !== null);
	$effect(() => {
		if (open) {
			closing = false;
			dragProgress = 0;
			settled = untrack(() => $viewerState?.index ?? 0);
			// Galleries page up and down, which nothing else has taught the user
			// yet. Say so until they have done it once.
			untrack(() => {
				if (($viewerState?.items.length ?? 0) > 1 && !$prefs.galleryHintShown) say('Swipe up for the next picture', 4000);
			});
			chromeHidden = false;
			sharp = {};
			sharpening.clear();
			loaded = {};
		}
	});

	// Put the pager on the starting image before it is first painted. Once,
	// when the pager appears: afterwards the index FOLLOWS the scroll position,
	// and writing it back mid-gesture would yank the pager from under the finger.
	$effect(() => {
		const el = pager;
		if (!el) return;
		untrack(() => {
			el.scrollTop = ($viewerState?.index ?? 0) * el.clientHeight;
		});
	});

	// The pager is the source of truth for which image is showing.
	function onScroll() {
		const el = pager;
		if (!el || el.clientHeight === 0) return;
		const i = Math.round(el.scrollTop / el.clientHeight);
		if (i !== index) {
			setViewerIndex(i);
			if (!$prefs.galleryHintShown) {
				prefs.update((p) => ({ ...p, galleryHintShown: true }));
				status = null;
			}
		}
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => (settled = index), 140);
	}

	function goTo(i: number) {
		const el = pager;
		if (!el || i < 0 || i >= count) return;
		el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' });
	}

	function srcFor(i: number): string {
		const item = items[i];
		return sharp[i] ?? item.preview ?? item.url;
	}

	// Get a sharper copy in the background and swap it in once decoded, so the
	// picture sharpens in place instead of blanking.
	async function sharpen(i: number) {
		const item = items[i];
		if (!item || !item.preview || item.preview === item.url || sharp[i] || sharpening.has(i)) return;
		sharpening.add(i);
		const src = await sharpCopy(item.url, item.pixels);
		sharpening.delete(i);
		if (src && $viewerState?.items[i] === item) sharp = { ...sharp, [i]: src };
	}

	// Vertical drag distance while pulling a picture away; fades the backdrop
	// so the page underneath shows through as it goes.
	let dragProgress = $state(0);
	let backdropOpacity = $derived(closing ? 0 : dragProgress > 0 ? Math.max(0.15, 1 - dragProgress / 400) : 1);
	// Buttons and caption get out of the way while a picture is being pulled.
	let chromeOff = $derived(chromeHidden || closing || dragProgress > 0);

	const CLOSE_ANIM_MS = 170;
	function dismiss() {
		if (closing) return;
		closing = true;
		setTimeout(closeViewer, CLOSE_ANIM_MS);
	}

	function onTap(onPicture: boolean) {
		// The picture toggles the buttons; the empty area around it closes.
		if (onPicture) chromeHidden = !chromeHidden;
		else closeViewer();
	}
	$effect(() => {
		index; // a different image starts fully opaque
		dragProgress = 0;
	});

	let busy = $state(false);
	let status = $state<string | null>(null);
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	function say(message: string, ms = 2500) {
		if (!message) return;
		status = message;
		if (statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (status = null), ms);
	}

	async function act(label: string, run: (url: string) => Promise<{ message: string }>) {
		if (!current || busy) return;
		busy = true;
		if (label) say(label);
		try {
			say((await run(current.url)).message);
		} finally {
			busy = false;
		}
	}
	const save = () => act('Saving…', saveImage);
	const copy = () => act('Copying…', copyImage);
	const share = () => act('', shareImage);
	async function openInBrowser() {
		if (current) await openExternal(current.url);
	}

	function onSlideClick(e: MouseEvent) {
		// Only reachable around a video: an image fills its slide and reports
		// its own taps.
		if (e.currentTarget === e.target) closeViewer();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') closeViewer();
		else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goTo(index + 1);
		else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goTo(index - 1);
	}

	// Keep the same image centred if the screen rotates or resizes.
	async function onResize() {
		await tick();
		if (pager) pager.scrollTop = index * pager.clientHeight;
	}
</script>

<svelte:window onkeydown={onKeydown} onresize={onResize} />

{#if $viewerState && current}
	<div class="viewer">
		<div class="backdrop" class:closing style:opacity={backdropOpacity}></div>

		<div class="pager" bind:this={pager} onscroll={onScroll}>
			{#each items as item, i (i)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div class="slide" onclick={onSlideClick}>
					<!-- Only the pictures near the one on screen are mounted, so a
					     twenty-picture gallery does not decode twenty pictures. -->
					{#if Math.abs(i - settled) <= READY || i === index}
						{#if item.kind === 'video'}
							{#if i === index}
								<!-- svelte-ignore a11y_media_has_caption -- Reddit-hosted video ships no caption track; there is nothing to attach. -->
								<video src={item.url} controls autoplay playsinline></video>
							{/if}
						{:else}
							{#if !loaded[i]}
								<span class="spinner" aria-hidden="true"></span>
							{/if}
							<img
								src={srcFor(i)}
								onload={() => (loaded = { ...loaded, [i]: true })}
								alt={item.alt ?? ''}
								referrerpolicy="no-referrer"
								decoding="async"
								draggable="false"
								use:pinchZoom={{
									maxScale: 5,
									pager: { prev: i > 0, next: i < count - 1 },
									onDismiss: dismiss,
									onDragProgress: (dy) => (dragProgress = dy),
									onTap,
									onZoomChange: (z) => z && sharpen(i)
								}}
							/>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

		<header class="bar" class:hidden={chromeOff}>
			<button class="iconbtn" onclick={closeViewer} aria-label="Close"><Icon name="close" size={24} /></button>
			{#if count > 1}
				<span class="counter">{index + 1} / {count}</span>
			{/if}
			<span class="spacer"></span>
			{#if current.kind === 'image'}
				<button class="iconbtn" onclick={copy} disabled={busy} aria-label="Copy image"><Icon name="content_copy" size={22} /></button>
			{/if}
			<button class="iconbtn" onclick={share} disabled={busy} aria-label="Share"><Icon name="share" size={22} /></button>
			<button class="iconbtn" onclick={save} disabled={busy} aria-label="Save"><Icon name="download" size={22} /></button>
			<button class="iconbtn" onclick={openInBrowser} aria-label="Open in browser"><Icon name="open_in_new" size={22} /></button>
		</header>

		{#if current.caption}
			<div class="caption" class:hidden={chromeOff}>{current.caption}</div>
		{/if}

		{#if count > 1}
			<div class="dots" class:hidden={chromeOff} aria-hidden="true">
				<div class="rail">
					{#each items as _, i (i)}
						<span class="dot" class:on={i === index}></span>
					{/each}
				</div>
			</div>
		{/if}

		{#if status}
			<div class="status" role="status">{status}</div>
		{/if}
	</div>
{/if}

<style>
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 200;
		animation: viewer-in 160ms ease-out;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		background: #000;
	}
	/* While a picture is under the finger the fade tracks it exactly; once it
	   is let go the rest of the fade plays out on its own. */
	.backdrop.closing {
		transition: opacity 170ms ease-out;
	}
	/* The pager: one screen-tall slide per item, scrolled by the browser. */
	.pager {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		overscroll-behavior: contain;
		scrollbar-width: none;
	}
	.pager::-webkit-scrollbar {
		display: none;
	}
	.slide {
		flex: 0 0 100%;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		scroll-snap-align: start;
		scroll-snap-stop: always;
		overflow: hidden;
		position: relative;
	}
	.slide video {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.slide img {
		/* Fills the slide and letterboxes the picture inside itself, so a
		   gesture can start anywhere on screen. touch-action and transform are
		   set by the pinchZoom action. */
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		transform-origin: center;
		will-change: transform;
		user-select: none;
		-webkit-user-drag: none;
	}
	/* Only appears if a picture is slow to arrive, so one already in the cache
	   never flashes it. */
	.spinner {
		position: absolute;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.25);
		border-top-color: #fff;
		opacity: 0;
		animation:
			viewer-spin 800ms linear infinite,
			viewer-in 200ms ease-out 350ms forwards;
	}
	.bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: calc(8px + env(safe-area-inset-top)) 8px 20px;
		color: #fff;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
		transition: opacity 140ms ease;
	}
	.hidden {
		opacity: 0;
		pointer-events: none;
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
		background: rgba(0, 0, 0, 0.35);
	}
	.iconbtn:active {
		background: rgba(255, 255, 255, 0.2);
	}
	.iconbtn:disabled {
		opacity: 0.5;
	}
	.counter {
		padding: 0 8px;
		color: #fff;
		font-size: var(--type-body);
		font-weight: var(--weight-title);
		pointer-events: none;
	}
	.caption {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 28px 24px calc(20px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
		color: #fff;
		font-size: var(--type-secondary);
		text-align: center;
		pointer-events: none;
		transition: opacity 140ms ease;
	}
	/* Down the right-hand edge, the way the pictures are stacked. */
	.dots {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 8px;
		display: flex;
		align-items: center;
		pointer-events: none;
		transition: opacity 140ms ease;
	}
	/* A dark pill behind the dots, so they read over a bright picture too. */
	.rail {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 5px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.45);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.4);
		transition:
			background 140ms ease,
			transform 140ms ease;
	}
	.dot.on {
		background: #fff;
		transform: scale(1.35);
	}
	.status {
		position: absolute;
		left: 50%;
		bottom: calc(56px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		padding: 10px 16px;
		border-radius: 20px;
		background: rgba(30, 30, 30, 0.95);
		color: #fff;
		font-size: var(--type-secondary);
		max-width: 80%;
		text-align: center;
	}
	@keyframes viewer-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes viewer-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
