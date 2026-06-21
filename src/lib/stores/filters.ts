// Content filters for the merged subscribed feed: hide posts by title keyword,
// subreddit, or link domain. Like the other local lists this lives on-device,
// backed by @capacitor/preferences.
//
// Rules are stored lowercased + trimmed. Matching:
//   - keywords:   case-insensitive substring of the post title
//   - subreddits: exact (case-insensitive) subreddit name
//   - domains:    the post's domain equals the rule OR ends with ".<rule>", so
//                 "x.com" matches x.com and mobile.x.com but NOT netflix.com

import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import type { Post } from '$lib/reddit/types';

export type FilterKind = 'keywords' | 'subreddits' | 'domains';

export interface FilterRules {
	keywords: string[];
	subreddits: string[];
	domains: string[];
}

const STORAGE_KEY = 'persimmon.filters';

function empty(): FilterRules {
	return { keywords: [], subreddits: [], domains: [] };
}

function norm(s: string): string {
	return s.trim().toLowerCase().replace(/^\/?(r\/|u\/)/, '');
}

const internal = writable<FilterRules>(empty());

export const filters = {
	subscribe: internal.subscribe,
	add(kind: FilterKind, value: string): void {
		const v = norm(value);
		if (!v) return;
		internal.update((r) => (r[kind].includes(v) ? r : { ...r, [kind]: [...r[kind], v] }));
	},
	remove(kind: FilterKind, value: string): void {
		internal.update((r) => ({ ...r, [kind]: r[kind].filter((x) => x !== value) }));
	},
	// Bulk-load from a backup import. Merge unions each list; replace overwrites.
	hydrate(rules: FilterRules, mode: 'merge' | 'replace'): void {
		const inc = sanitize(rules);
		internal.update((cur) => {
			if (mode === 'replace') return inc;
			return {
				keywords: [...new Set([...cur.keywords, ...inc.keywords])],
				subreddits: [...new Set([...cur.subreddits, ...inc.subreddits])],
				domains: [...new Set([...cur.domains, ...inc.domains])]
			};
		});
	},
	clear(): void {
		internal.set(empty());
	}
};

// Pure matcher — pass the current rules (e.g. `$filters`) so callers stay
// reactive. Returns true when the post should be hidden by the filters.
export function postMatchesFilters(post: Post, rules: FilterRules): boolean {
	const title = post.title?.toLowerCase() ?? '';
	if (rules.keywords.some((k) => title.includes(k))) return true;

	const sub = post.subreddit?.toLowerCase() ?? '';
	if (rules.subreddits.includes(sub)) return true;

	const domain = post.domain?.toLowerCase() ?? '';
	if (rules.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

	return false;
}

function sanitize(parsed: unknown): FilterRules {
	const out = empty();
	if (parsed && typeof parsed === 'object') {
		const p = parsed as Record<string, unknown>;
		for (const kind of ['keywords', 'subreddits', 'domains'] as FilterKind[]) {
			if (Array.isArray(p[kind])) {
				out[kind] = (p[kind] as unknown[]).filter((x): x is string => typeof x === 'string');
			}
		}
	}
	return out;
}

async function load(): Promise<void> {
	if (!browser) return;
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (value) internal.set(sanitize(JSON.parse(value)));
	} catch {
		// fall through to empty
	}
	internal.subscribe(async (r) => {
		try {
			await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(r) });
		} catch {
			// ignore — non-fatal
		}
	});
}

export const filtersReady = load();
