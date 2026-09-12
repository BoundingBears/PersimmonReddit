// Svelte action: drag rows by a handle to reorder a keyed list.
//
// Attach to the list container. Rows match `row` and carry `data-index`;
// the grab area matches `handle`. On every pointer move the row under the
// finger is computed and, if it differs from the dragged row's current slot,
// `onMove(from, to)` fires — the caller reorders its store, the keyed {#each}
// re-renders, and `animate:flip` on the rows slides the others out of the way.
//
// Two details that matter on a phone:
//   - The handle needs `touch-action: none` in CSS, or the browser takes the
//     gesture as a scroll and pointermove stops firing.
//   - Slot detection uses offsetTop/offsetHeight, NOT getBoundingClientRect —
//     the flip animation moves rows with transforms, and reading transformed
//     rects mid-animation makes the target flip-flop under a still finger.
//
// Pointer capture goes on the handle element. It's the same DOM node after a
// reorder (keyed each), so capture survives the row changing position.

import { tick as haptic } from '$lib/utils/haptics';

export interface DragReorderOptions {
	handle: string;
	row: string;
	enabled?: boolean;
	onMove: (from: number, to: number) => void;
}

export function dragReorder(node: HTMLElement, opts: DragReorderOptions) {
	let o = opts;
	let dragEl: HTMLElement | null = null;
	let handleEl: HTMLElement | null = null;

	function rows(): HTMLElement[] {
		return Array.from(node.querySelectorAll<HTMLElement>(o.row));
	}

	function indexAt(clientY: number): number {
		const rs = rows();
		if (rs.length === 0) return -1;
		const parent = rs[0].offsetParent as HTMLElement | null;
		const y = clientY - (parent ? parent.getBoundingClientRect().top : 0);
		for (let i = 0; i < rs.length; i++) {
			if (y < rs[i].offsetTop + rs[i].offsetHeight) return i;
		}
		return rs.length - 1;
	}

	function down(e: PointerEvent) {
		if (o.enabled === false) return;
		const h = (e.target as HTMLElement | null)?.closest<HTMLElement>(o.handle);
		if (!h || !node.contains(h)) return;
		const row = h.closest<HTMLElement>(o.row);
		if (!row) return;
		e.preventDefault();
		dragEl = row;
		handleEl = h;
		try {
			h.setPointerCapture(e.pointerId);
		} catch {
			// capture is best-effort; the gesture still works without it
		}
		row.classList.add('dragging');
		haptic();
	}

	function move(e: PointerEvent) {
		if (!dragEl) return;
		e.preventDefault();
		const from = Number(dragEl.dataset.index);
		const to = indexAt(e.clientY);
		if (to < 0 || Number.isNaN(from) || to === from) return;
		o.onMove(from, to);
		haptic();
	}

	function up(e: PointerEvent) {
		if (!dragEl) return;
		try {
			handleEl?.releasePointerCapture(e.pointerId);
		} catch {
			// already released
		}
		dragEl.classList.remove('dragging');
		dragEl = null;
		handleEl = null;
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', up);

	return {
		update(next: DragReorderOptions) {
			o = next;
			if (o.enabled === false && dragEl) {
				dragEl.classList.remove('dragging');
				dragEl = null;
				handleEl = null;
			}
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
		}
	};
}
