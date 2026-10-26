<script lang="ts">
	// What the app shows instead of something locked: the whole app, or a post
	// from the private folder that was left open. Opaque and above everything,
	// so nothing underneath can be seen or tapped.
	import { onMount } from 'svelte';
	import PersimmonMark from './PersimmonMark.svelte';
	import Icon from './Icon.svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { introPlaying } from '$lib/utils/bootIntro';

	interface Props {
		// What is locked: "Persimmon", or "Private folder".
		name: string;
		// Ask for the fingerprint; resolves true if it was given.
		confirm: () => Promise<boolean>;
		// Take this cover away.
		open: () => void;
		// Whether the cover is still needed (it may have been lifted for us).
		stillLocked: () => boolean;
	}
	let { name, confirm, open, stillLocked }: Props = $props();

	// Where the contents sit: the same 36% down that the launch animation uses,
	// turned into pixels once so they never move afterwards.
	const topPx = Math.round((typeof window === 'undefined' ? 0 : window.innerHeight) * 0.36);

	// Unlocking with a PIN leaves Android's keyboard on screen for a moment
	// after the prompt has gone, and the app is squeezed into the space above
	// it until it slides away. Opening straight onto that showed the whole app
	// squashed into the top half of the screen. So stay put until the app has
	// its full height back, or 0.7 s, whichever comes first. With a fingerprint
	// there is no keyboard and this does not wait at all.
	function heightBack(to: number): Promise<void> {
		return new Promise((resolve) => {
			const began = performance.now();
			const check = () => {
				if (window.innerHeight >= to - 2 || performance.now() - began > 700) resolve();
				else requestAnimationFrame(check);
			};
			check();
		});
	}

	let asking = $state(false);
	async function ask() {
		if (asking) return;
		asking = true;
		// The height right now, with the prompt not yet up, is the one to wait
		// to get back to. (Measured at mount it can be a launch-time value the
		// app never returns to, and the wait would always run to its limit.)
		const before = window.innerHeight;
		if (await confirm()) {
			await heightBack(before);
			open();
		}
		asking = false;
	}

	// Ask at once: the lock screen appearing is the request. With two
	// exceptions. On a fresh launch the animation plays first and the prompt
	// waits for it to finish, so the two never overlap. And in the background,
	// where the cover is put up on the way out (lock.ts), there is nobody to
	// ask until they come back; a return within the allowed time lifts it
	// without asking at all.
	onMount(() => {
		let t: ReturnType<typeof setTimeout> | null = null;
		const askSoon = (ms: number) => {
			if (t) clearTimeout(t);
			t = setTimeout(() => {
				// Still locked: a return within the grace period unlocks by itself.
				if (document.visibilityState === 'visible' && stillLocked() && !get(introPlaying)) void ask();
			}, ms);
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') askSoon(200);
		};
		document.addEventListener('visibilitychange', onVisible);
		const stopWatchingIntro = introPlaying.subscribe((playing) => {
			if (!playing) askSoon(0);
		});
		return () => {
			if (t) clearTimeout(t);
			stopWatchingIntro();
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<!-- The launch animation's last frame with a lock on it: same orange, same
     green corner, the mark and the name in the same place. On a locked launch
     the animation lifts away onto this, and only the lock is new.
     Placed from the top by a fixed distance, not centred: centred, it would
     jump as the keyboard under the prompt comes and goes. -->
<div class="lock" role="dialog" aria-modal="true" aria-label="{name} is locked" out:fade={{ duration: 160 }}>
	<span class="corner rim"></span>
	<span class="corner"></span>
	<div class="content" style:padding-top="{topPx}px">
		<span class="mark"><PersimmonMark /></span>
		<div class="name">{name}</div>
		<div class="state">Locked</div>
		<button class="unlock" onclick={ask} disabled={asking} aria-label="Unlock">
			<span class="pulse"></span>
			<Icon name="lock" size={30} />
		</button>
		<div class="hint">Tap to unlock with your fingerprint<br />or your phone's screen lock</div>
	</div>
</div>

<style>
	.lock {
		position: fixed;
		inset: 0;
		/* Above sheets and toasts (210), below the launch animation (1000). */
		z-index: 900;
		overflow: hidden;
		/* The brand's own colours, whatever theme the app is in: this is not a
		   page of the app, it is the door to it. */
		background: #ed5d1f;
		color: #fff6ec;
	}
	/* The green corner, where the launch animation leaves it. */
	.corner {
		position: absolute;
		inset: 0;
		background: #567a2c;
		clip-path: circle(43vmax at 100% 100%);
	}
	.corner.rim {
		background: #3a581e;
		clip-path: circle(47vmax at 100% 100%);
	}
	.content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.mark {
		line-height: 0;
		margin-bottom: 14px;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.12));
	}
	.name {
		font-size: 36px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.1;
	}
	.state {
		margin-top: 6px;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		opacity: 0.88;
	}
	.unlock {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		margin-top: 36px;
		border-radius: 36px;
		background: #fff6ec;
		color: #c94a12;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
		transition: transform 120ms ease;
	}
	.unlock:active {
		transform: scale(0.94);
	}
	.unlock:disabled {
		opacity: 0.75;
	}
	/* A slow ring off the button: this is the thing to tap. */
	.pulse {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		border: 2px solid #fff6ec;
		animation: lock-pulse 2s ease-out infinite;
	}
	.unlock:disabled .pulse {
		animation: none;
		opacity: 0;
	}
	@keyframes lock-pulse {
		from {
			transform: scale(1);
			opacity: 0.7;
		}
		to {
			transform: scale(1.55);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
			opacity: 0;
		}
	}
	.hint {
		margin-top: 22px;
		font-size: 13px;
		line-height: 1.5;
		opacity: 0.92;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
	}
</style>
