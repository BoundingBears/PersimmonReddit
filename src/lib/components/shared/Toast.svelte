<script lang="ts">
	// The snackbar: one line of feedback above the bottom bar, sometimes with a
	// button (Undo).
	//
	// Every one is the same bar. They used to be pills sized to their text, so
	// "Saved" was a dot in the middle of the screen and a longer message ran
	// nearly edge to edge, with the text centred in one and left-aligned in the
	// next. Now the width is fixed, the text starts at the same left edge, and
	// the button, when there is one, sits at the same right edge.
	//
	// It can be flicked away, sideways or down, like any snackbar on the phone.
	// The clock stops while a finger is on it (toast.ts).
	import { flip } from 'svelte/animate';
	import { toasts, dismissToast, holdToast, releaseToast } from '$lib/stores/toast';

	function runAction(toastId: number, onClick: () => void) {
		try {
			onClick();
		} finally {
			dismissToast(toastId);
		}
	}

	const SLOP = 8;

	function swipe(node: HTMLElement, id: number) {
		let pointer = -1;
		let startX = 0;
		let startY = 0;
		let startedAt = 0;
		let dx = 0;
		let dy = 0;
		let axis: 'x' | 'y' | null = null;
		// A drag ends with a click on whatever was under the finger at the start.
		let dragged = false;

		function draw() {
			if (axis === 'x') {
				node.style.transform = `translateX(${dx}px)`;
				node.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / (node.offsetWidth * 0.8)));
			} else {
				const down = Math.max(0, dy);
				node.style.transform = `translateY(${down}px)`;
				node.style.opacity = String(Math.max(0, 1 - down / 90));
			}
		}

		function onDown(e: PointerEvent) {
			if (pointer !== -1 || node.dataset.gone) return;
			pointer = e.pointerId;
			startX = e.clientX;
			startY = e.clientY;
			startedAt = e.timeStamp;
			dx = dy = 0;
			axis = null;
			dragged = false;
			holdToast(id);
		}

		function onMove(e: PointerEvent) {
			if (e.pointerId !== pointer) return;
			dx = e.clientX - startX;
			dy = e.clientY - startY;
			if (!axis) {
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
				axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
				dragged = true;
				node.setPointerCapture(pointer);
			}
			draw();
		}

		function onUp(e: PointerEvent) {
			if (e.pointerId !== pointer) return;
			pointer = -1;
			const travelled = axis === 'x' ? Math.abs(dx) : Math.max(0, dy);
			const speed = travelled / Math.max(1, e.timeStamp - startedAt); // px per ms
			const far = axis === 'x' ? travelled > node.offsetWidth * 0.3 : travelled > 32;
			const from = { transform: node.style.transform || 'none', opacity: node.style.opacity || '1' };
			if (axis && e.type !== 'pointercancel' && (far || (speed > 0.45 && travelled > 20))) {
				// Carry on in the direction it was going, then drop it.
				const to =
					axis === 'x'
						? `translateX(${Math.sign(dx) * (node.offsetWidth + 48)}px)`
						: 'translateY(110px)';
				node.dataset.gone = 'true';
				node
					.animate([from, { transform: to, opacity: '0' }], { duration: 150, easing: 'ease-out', fill: 'forwards' })
					.finished.finally(() => dismissToast(id));
			} else {
				if (axis) node.animate([from, { transform: 'none', opacity: '1' }], { duration: 180, easing: 'ease-out' });
				node.style.transform = '';
				node.style.opacity = '';
				releaseToast(id);
			}
			axis = null;
		}

		function onClick(e: MouseEvent) {
			if (!dragged) return;
			dragged = false;
			e.stopPropagation();
			e.preventDefault();
		}

		node.addEventListener('pointerdown', onDown);
		node.addEventListener('pointermove', onMove);
		node.addEventListener('pointerup', onUp);
		node.addEventListener('pointercancel', onUp);
		node.addEventListener('click', onClick, true);
		return {
			destroy() {
				node.removeEventListener('pointerdown', onDown);
				node.removeEventListener('pointermove', onMove);
				node.removeEventListener('pointerup', onUp);
				node.removeEventListener('pointercancel', onUp);
				node.removeEventListener('click', onClick, true);
			}
		};
	}

	function arrive(_node: HTMLElement) {
		return {
			duration: 200,
			css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * 16}px)`
		};
	}
	// One that was flicked away has already left; do not play it leaving again.
	function leave(node: HTMLElement) {
		if (node.dataset.gone) return { duration: 0 };
		return {
			duration: 150,
			css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * 12}px)`
		};
	}
</script>

<div class="stack" aria-live="polite" aria-atomic="true">
	{#each $toasts as t (t.id)}
		<div class="toast" use:swipe={t.id} in:arrive out:leave animate:flip={{ duration: 180 }}>
			<button type="button" class="message" onclick={() => dismissToast(t.id)}>
				<span class="text">{t.message}</span>
			</button>
			{#if t.action}
				<button type="button" class="action" onclick={() => runAction(t.id, t.action!.onClick)}>
					{t.action.label}
				</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		left: 12px;
		right: 12px;
		/* Just clear of the bottom bar, whose height BottomNav publishes. */
		bottom: calc(var(--bottom-nav-h, calc(62px + env(safe-area-inset-bottom))) + 10px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		z-index: 210; /* above every sheet (160-201): a toast is feedback about
		                   what a sheet just did, so it must never render behind one */
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		/* The gesture is ours: without this the page scrolls under a downward
		   flick and the browser cancels the drag. */
		touch-action: none;
		user-select: none;
		display: flex;
		align-items: center;
		gap: 4px;
		/* The same bar for every message, whatever its length. */
		width: 100%;
		max-width: 460px;
		min-height: 48px;
		padding: 0 6px 0 16px;
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		border-radius: 14px;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
	}
	.message {
		flex: 1;
		min-width: 0;
		padding: 13px 10px 13px 0;
		text-align: left;
		color: inherit;
		background: transparent;
		border: 0;
		font: inherit;
		font-size: var(--type-body);
		line-height: 1.4;
	}
	/* Two lines at most, so the bar keeps its shape. */
	.text {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.action {
		flex: none;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 10px;
		color: var(--md-sys-color-inverse-primary);
		background: transparent;
		border: 0;
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--weight-heading);
	}
	.action:active {
		background: color-mix(in srgb, var(--md-sys-color-inverse-primary) 16%, transparent);
	}
</style>
