<script lang="ts">
	// The pull-to-refresh spinner.
	//
	// It used to be drawn straight from two numbers: shown while the pull
	// distance was above zero or a refresh was running, gone the instant
	// neither was true. A refresh that took 200 ms was a 200 ms flash, a pull
	// let go early blinked out, and letting go past the threshold made it jump
	// from under the finger to its resting place.
	//
	// Now it has a life of its own, in four phases:
	//   pulling   follows the finger: slides down, grows, and its arc closes
	//             as the pull nears the point where letting go will refresh.
	//   spinning  eases to its resting place and turns, for at least
	//             MIN_SPIN_MS however fast the refresh was, so it reads as
	//             something that happened.
	//   leaving   shrinks away where it is (after a refresh) or slides back
	//             up (a pull that was let go early).
	//   hidden
	// The refresh itself is not slowed down: new posts appear when they
	// arrive, under a spinner that is finishing its turn.
	import { onDestroy, untrack } from 'svelte';

	interface Props {
		distance: number;
		refreshing: boolean;
		threshold?: number;
		max?: number;
	}

	let { distance, refreshing, threshold = 80, max = 140 }: Props = $props();

	const MIN_SPIN_MS = 900;
	const LEAVE_MS = 260;
	// Its own height plus the gap above it: how far up "out of sight" is.
	const TUCKED = 48;

	type Phase = 'hidden' | 'pulling' | 'spinning' | 'leaving';
	let phase = $state<Phase>('hidden');
	// A pull let go early slides back up; a finished refresh shrinks in place.
	let retracting = $state(false);
	let spunSince = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function cancel() {
		if (timer) clearTimeout(timer);
		timer = null;
	}
	function after(ms: number, fn: () => void) {
		cancel();
		timer = setTimeout(() => {
			timer = null;
			fn();
		}, ms);
	}
	function leave(retract: boolean) {
		retracting = retract;
		phase = 'leaving';
		after(LEAVE_MS, () => (phase = 'hidden'));
	}
	onDestroy(cancel);

	$effect(() => {
		const busy = refreshing;
		const pulled = distance > 0;
		untrack(() => {
			if (busy) {
				if (phase !== 'spinning') {
					cancel();
					phase = 'spinning';
					spunSince = performance.now();
				}
			} else if (phase === 'spinning') {
				// Pulled again before the last one has finished its turn.
				if (pulled) {
					cancel();
					phase = 'pulling';
				} else if (!timer) {
					after(Math.max(0, MIN_SPIN_MS - (performance.now() - spunSince)), () => leave(false));
				}
			} else if (pulled) {
				cancel();
				phase = 'pulling';
			} else if (phase === 'pulling') {
				leave(true);
			}
		});
	});

	// 0 at rest, 1 where letting go will refresh.
	let progress = $derived(Math.min(1, distance / threshold));
	let armed = $derived(phase === 'pulling' && distance >= threshold);
	let rest = $derived(threshold - TUCKED);
	let y = $derived(
		phase === 'pulling' ? Math.min(distance, max) - TUCKED : phase === 'leaving' && retracting ? -TUCKED : rest
	);
	let scale = $derived(phase === 'pulling' ? 0.6 + 0.4 * progress : 1);
	let opacity = $derived(phase === 'pulling' ? Math.min(1, progress * 1.4) : 1);
	// The arc: a sliver at first, three quarters of a ring when armed, turning
	// with the finger so the pull feels geared to it.
	let sweep = $derived(8 + 67 * progress);
	let turn = $derived(distance * 2.4 - 90);
</script>

{#if phase !== 'hidden'}
	<div
		class="indicator"
		class:armed
		class:pulling={phase === 'pulling'}
		class:spinning={phase === 'spinning'}
		class:leaving={phase === 'leaving'}
		class:retracting={phase === 'leaving' && retracting}
		style:--y="{y}px"
		style:--s={scale}
		style:--o={opacity}
	>
		<svg class="ring" viewBox="0 0 24 24" aria-hidden="true" style:--turn="{turn}deg">
			<circle class="arc" cx="12" cy="12" r="8" pathLength="100" style:--sweep={sweep} />
		</svg>
	</div>
{/if}

<style>
	.indicator {
		position: absolute;
		top: 8px;
		left: 50%;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
		pointer-events: none;
		transform: translate(-50%, var(--y)) scale(var(--s));
		opacity: var(--o);
		transition:
			color 140ms ease-out,
			background-color 140ms ease-out;
	}
	/* Under the finger it moves with the finger, with nothing in between. Once
	   let go, it travels: to its resting place, or back out of sight. */
	.indicator.spinning {
		color: var(--md-sys-color-primary);
		transition:
			transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1),
			color 140ms ease-out,
			background-color 140ms ease-out;
	}
	.indicator.armed {
		color: var(--md-sys-color-primary);
		background: var(--md-sys-color-primary-container);
	}
	.indicator.leaving {
		color: var(--md-sys-color-primary);
		transform: translate(-50%, var(--y)) scale(0.3);
		opacity: 0;
		transition:
			transform 260ms cubic-bezier(0.4, 0, 1, 1),
			opacity 240ms ease-in;
	}
	.indicator.retracting {
		color: var(--md-sys-color-on-surface-variant);
		transform: translate(-50%, var(--y)) scale(0.6);
		transition:
			transform 260ms cubic-bezier(0.3, 0, 0.6, 1),
			opacity 200ms ease-in;
	}

	.ring {
		width: 24px;
		height: 24px;
		transform: rotate(var(--turn));
	}
	.arc {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-dasharray: var(--sweep) 100;
	}
	/* Turning steadily while the arc breathes between a sliver and most of a
	   ring, the way Android's own refresh spinner does. Longhands throughout:
	   the build's minifier has dropped an `animation` shorthand before. */
	.spinning .ring,
	.leaving:not(.retracting) .ring {
		animation-name: ptr-turn;
		animation-duration: 1100ms;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
	}
	.spinning .arc,
	.leaving:not(.retracting) .arc {
		animation-name: ptr-breathe;
		animation-duration: 1500ms;
		animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		animation-iteration-count: infinite;
	}
	@keyframes ptr-turn {
		from {
			transform: rotate(var(--turn));
		}
		to {
			transform: rotate(calc(var(--turn) + 360deg));
		}
	}
	@keyframes ptr-breathe {
		0% {
			stroke-dasharray: 75 100;
			stroke-dashoffset: 0;
		}
		50% {
			stroke-dasharray: 12 100;
			stroke-dashoffset: -44;
		}
		100% {
			stroke-dasharray: 75 100;
			stroke-dashoffset: -100;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinning .arc,
		.leaving:not(.retracting) .arc {
			animation-name: none;
		}
		.spinning .ring,
		.leaving:not(.retracting) .ring {
			animation-duration: 2400ms;
		}
	}
</style>
