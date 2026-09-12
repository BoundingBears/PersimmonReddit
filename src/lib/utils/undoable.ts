// One way to destroy user data: do it immediately, then offer Undo.
//
// The app had grown three different answers to "the user asked to delete
// something": /saved and /hidden cleared straight away with an Undo toast,
// Settings put up a confirmation dialog, and deleting a custom feed did
// neither. Same class of action, three different contracts — so the user can't
// learn what a destructive button in this app does.
//
// Undo wins over a confirm dialog here because it's the pattern that was
// already built and working, it costs nothing on the common path (no modal to
// dismiss before the thing you asked for happens), and it protects the action
// that previously had no protection at all.
//
// Caches are the deliberate exception: clearing them destroys nothing the user
// created and they refill on their own, so they clear on one tap with a plain
// toast and no Undo.

import { pushToast } from '$lib/stores/toast';
import { tick as haptic } from './haptics';

export const UNDO_DURATION_MS = 6000;
// Sentence case, matching every other button in the app. Toast actions were
// split between 'UNDO' and 'Undo' with no text-transform to reconcile them.
export const UNDO_LABEL = 'Undo';

/**
 * Perform a destructive action and offer to reverse it.
 * `undo` must fully restore the state captured *before* `perform` runs.
 */
export function undoable(opts: {
	message: string;
	perform: () => void;
	undo: () => void;
	duration?: number;
	/** Stable identity for this action; repeat taps replace the toast rather
	 *  than stacking one per tap. Defaults to the message. */
	key?: string;
}): void {
	opts.perform();
	haptic();
	pushToast(opts.message, {
		key: opts.key ?? `undo:${opts.message}`,
		replace: true,
		duration: opts.duration ?? UNDO_DURATION_MS,
		action: { label: UNDO_LABEL, onClick: opts.undo }
	});
}

/**
 * The counted-clear flavour ("Cleared 41 subscribed subs"), so every clear in
 * the app words itself the same way. No-ops on an empty collection.
 */
export function undoableClear(opts: {
	count: number;
	singular: string;
	plural: string;
	perform: () => void;
	undo: () => void;
}): void {
	if (opts.count === 0) return;
	undoable({
		key: `clear:${opts.plural}`,
		message: `Cleared ${opts.count} ${opts.count === 1 ? opts.singular : opts.plural}`,
		perform: opts.perform,
		undo: opts.undo
	});
}
