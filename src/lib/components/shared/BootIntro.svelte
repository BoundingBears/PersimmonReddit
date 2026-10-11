<script lang="ts">
	// The launch animation: orange sweeps in from one corner and green from the
	// opposite one, the name sits on top for a moment, and the whole thing
	// lifts away to the app.
	//
	// It is a cover, not a gate. The app underneath mounts and starts fetching
	// the feed the instant it would have anyway; this plays over the second or
	// so that takes and then leaves, whether or not the feed has arrived. It
	// starts from the same dark colour as Android's own launch screen, so the
	// hand-over from that to this is not visible.
	import { onMount } from 'svelte';
	import { App } from '@capacitor/app';
	import { SplashScreen } from '@capacitor/splash-screen';
	import { IS_NATIVE } from '$lib/utils/platform';
	import { introPlaying } from '$lib/utils/bootIntro';

	let gone = $state(false);
	let leaving = $state(false);
	// The sweeps wait for Android's launch screen to get out of the way. They
	// used to start the moment this mounted, which is while that screen is
	// still fading, and most of the sweep played underneath it unseen.
	let started = $state(false);
	const SPLASH_FADE_MS = 120;
	$effect(() => {
		if (gone) introPlaying.set(false);
	});

	// Sweep in and settle, hold long enough to read the name, lift away:
	// 1.25 s in all. The owner asked for about a second and is fine with up
	// to 1.5 s, so keep the sum of these two under that if either changes.
	const HOLD_UNTIL_MS = 1000;
	const LEAVE_MS = 250;

	onMount(() => {
		const timers: ReturnType<typeof setTimeout>[] = [];
		const begin = () => {
			started = true;
			timers.push(setTimeout(() => (leaving = true), HOLD_UNTIL_MS));
			timers.push(setTimeout(() => (gone = true), HOLD_UNTIL_MS + LEAVE_MS + 40));
		};
		// Two frames so this cover has been painted, then let the launch
		// screen go; it and this start from the same colour.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_MS }).catch(() => undefined);
				timers.push(setTimeout(begin, IS_NATIVE ? SPLASH_FADE_MS + 30 : 0));
			})
		);
		// Opened from a link: the user asked for a page, not for a show.
		if (IS_NATIVE) {
			App.getLaunchUrl()
				.then((launch) => {
					if (launch?.url) gone = true;
				})
				.catch(() => undefined);
		}
		return () => {
			for (const t of timers) clearTimeout(t);
			introPlaying.set(false);
		};
	});
</script>

{#if !gone}
	<div class="intro" class:started class:leaving aria-hidden="true">
		<span class="sweep orange-rim"></span>
		<span class="sweep orange"></span>
		<span class="sweep green-rim"></span>
		<span class="sweep green"></span>
		<div class="brand">
			<!-- The leaf cap from the app icon. -->
			<svg class="mark" viewBox="-50 -50 100 100" width="72" height="72">
				<g fill="#567A2C">
					{#each [45, 135, 225, 315] as a (a)}
						<ellipse rx="19" ry="27" cy="-23" transform="rotate({a})" />
					{/each}
				</g>
				<g fill="#3A581E">
					{#each [0, 90, 180, 270] as a (a)}
						<ellipse rx="9" ry="13" cy="-11" transform="rotate({a})" />
					{/each}
				</g>
				<circle r="6" fill="#4A321E" />
			</svg>
			<div class="name">Persimmon</div>
			<div class="for">for Reddit</div>
		</div>
	</div>
{/if}

<style>
	.intro {
		position: fixed;
		inset: 0;
		z-index: 1000;
		overflow: hidden;
		/* Android's launch screen colour (styles.xml), so there is no seam. */
		background: #141218;
		transition:
			opacity 250ms ease-in,
			transform 250ms ease-in;
	}
	.intro.leaving {
		opacity: 0;
		transform: scale(1.04);
		pointer-events: none;
	}
	/* Each sweep is a full-screen sheet of colour, revealed by a circle that
	   grows out of a corner. */
	.sweep {
		position: absolute;
		inset: 0;
		/* Longhands on purpose: the CSS minifier collapses a shorthand that has
		   no animation name to `animation: none`, which throws the timing away. */
		animation-duration: 460ms;
		animation-timing-function: cubic-bezier(0.22, 0.9, 0.24, 1);
		animation-fill-mode: both;
		animation-play-state: paused;
	}
	.started .sweep,
	.started .brand {
		animation-play-state: running;
	}
	.orange-rim {
		background: #c94a12;
		animation-name: from-top-left;
	}
	.orange {
		background: #ed5d1f;
		animation-name: from-top-left;
		animation-delay: 60ms;
	}
	.green-rim {
		background: #3a581e;
		animation-name: from-bottom-right-rim;
		animation-delay: 150ms;
	}
	.green {
		background: #567a2c;
		animation-name: from-bottom-right;
		animation-delay: 210ms;
	}
	@keyframes from-top-left {
		from {
			clip-path: circle(0 at 0 0);
		}
		to {
			clip-path: circle(150vmax at 0 0);
		}
	}
	/* The green stops short: a rounded corner of it, not a second flood. */
	@keyframes from-bottom-right-rim {
		from {
			clip-path: circle(0 at 100% 100%);
		}
		to {
			clip-path: circle(47vmax at 100% 100%);
		}
	}
	@keyframes from-bottom-right {
		from {
			clip-path: circle(0 at 100% 100%);
		}
		to {
			clip-path: circle(43vmax at 100% 100%);
		}
	}
	.brand {
		position: absolute;
		left: 0;
		right: 0;
		top: 36%;
		display: flex;
		flex-direction: column;
		align-items: center;
		color: #fff6ec;
		animation-name: brand-in;
		animation-duration: 240ms;
		animation-timing-function: ease-out;
		animation-delay: 300ms;
		animation-fill-mode: both;
		animation-play-state: paused;
	}
	.mark {
		margin-bottom: 14px;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.12));
	}
	.name {
		font-size: 36px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.1;
	}
	.for {
		margin-top: 6px;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		opacity: 0.88;
	}
	@keyframes brand-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
