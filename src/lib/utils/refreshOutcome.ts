// What to say after a pull-to-refresh.
//
// A refresh that brings back the same posts looks exactly like a refresh that
// did nothing: the spinner goes away and the feed is as it was. That left the
// user asking, more than once, whether refresh works at all. So the one case
// with nothing to see says so. New posts speak for themselves.

import { pushToast } from '$lib/stores/toast';

const COMPARED = 5;

/** The ids to hold on to before reloading. */
export function topOf(posts: { id: string }[]): string[] {
	return posts.slice(0, COMPARED).map((p) => p.id);
}

export function sameTop(before: string[], after: string[]): boolean {
	return before.length > 0 && before.join() === after.join();
}

export function reportRefresh(before: string[], posts: { id: string }[], failed: boolean): void {
	if (failed) {
		pushToast("Couldn't refresh. Showing what was already loaded.", { key: 'refresh', replace: true });
	} else if (sameTop(before, topOf(posts))) {
		pushToast('Refreshed. No new posts yet.', { key: 'refresh', replace: true });
	}
}
