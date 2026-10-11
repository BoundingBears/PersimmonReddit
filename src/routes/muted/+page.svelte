<script lang="ts">
	// Everything the user has asked not to see, in one place: muted subreddits,
	// blocked users, muted words and muted sites.
	//
	// This replaces the "Filters" section of Settings, which was four text boxes
	// in a row with no lists, under a name the rest of the app never used (posts
	// say "Mute r/..." and "Block u/..."). One tab per kind, each saying exactly
	// where it applies, with the entries as a list that can be tapped or removed.
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Tabs from '$lib/components/shared/Tabs.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { filters } from '$lib/stores/filters';
	import { blockedUsers, normalizeUser } from '$lib/stores/blockedUsers';
	import { pushToast } from '$lib/stores/toast';
	import { undoable } from '$lib/utils/undoable';

	type Kind = 'subreddits' | 'users' | 'words' | 'sites';
	const KINDS: Kind[] = ['subreddits', 'users', 'words', 'sites'];

	const requested = $page.url.searchParams.get('tab') as Kind;
	let kind = $state<Kind>(KINDS.includes(requested) ? requested : 'subreddits');
	let draft = $state('');

	let subs = $derived($filters.subreddits);
	let users = $derived([...$blockedUsers.values()].map((u) => u.name));
	let words = $derived($filters.keywords);
	let sites = $derived($filters.domains);

	let tabs = $derived([
		{ value: 'subreddits' as Kind, label: 'Subreddits', count: subs.length },
		{ value: 'users' as Kind, label: 'Users', count: users.length },
		{ value: 'words' as Kind, label: 'Words', count: words.length },
		{ value: 'sites' as Kind, label: 'Sites', count: sites.length }
	]);

	interface Spec {
		prefix: string;
		placeholder: string;
		explains: string;
		emptyTitle: string;
		emptyBody: string;
		verb: string; // "Unmute" / "Unblock" / "Remove"
		/** Clean up what was typed, or return null if it is not a usable entry. */
		clean: (raw: string) => string | null;
		invalid: string;
	}

	const SPEC: Record<Kind, Spec> = {
		subreddits: {
			prefix: 'r/',
			placeholder: 'subreddit name',
			explains:
				'Posts from these subreddits are hidden from the front page, r/all, r/popular, your subscribed feed and custom feeds. Opening the subreddit itself still shows it.',
			emptyTitle: 'No muted subreddits',
			emptyBody: 'Long-press a post in any feed and choose Mute, or add a subreddit above.',
			verb: 'Unmute',
			clean: (raw) => {
				// Accept a bare name, r/name, or a pasted link.
				const m = raw.trim().match(/(?:^|\/)r\/([A-Za-z0-9_]+)/) ?? raw.trim().match(/^([A-Za-z0-9_]+)$/);
				const name = m?.[1] ?? '';
				return /^[A-Za-z0-9_]{2,21}$/.test(name) ? name.toLowerCase() : null;
			},
			invalid: "That doesn't look like a subreddit name"
		},
		users: {
			prefix: 'u/',
			placeholder: 'username',
			explains:
				'Posts by these users are hidden from every feed and from search, and their comments are collapsed in every thread.',
			emptyTitle: 'No blocked users',
			emptyBody: 'Long-press a post and choose Block, use the icon on a profile, or add a username above.',
			verb: 'Unblock',
			clean: (raw) => {
				const m = raw.trim().match(/(?:^|\/)(?:u|user)\/([A-Za-z0-9_-]+)/) ?? raw.trim().match(/^([A-Za-z0-9_-]+)$/);
				const name = m?.[1] ?? '';
				return /^[A-Za-z0-9_-]{2,20}$/.test(name) ? name : null;
			},
			invalid: "That doesn't look like a username"
		},
		words: {
			prefix: '',
			placeholder: 'a word or phrase',
			explains:
				'Posts whose title contains any of these are hidden from your feeds. Capitalisation is ignored.',
			emptyTitle: 'No muted words',
			emptyBody: 'Add a word or phrase above to hide posts that mention it in the title.',
			verb: 'Remove',
			clean: (raw) => {
				const w = raw.trim().toLowerCase();
				return w.length >= 2 ? w : null;
			},
			invalid: 'Use at least two characters'
		},
		sites: {
			prefix: '',
			placeholder: 'example.com',
			explains:
				'Link posts that point to these sites are hidden from your feeds. Adding example.com also covers its subdomains.',
			emptyTitle: 'No muted sites',
			emptyBody: 'Add a site above, for example a news outlet you would rather not see links to.',
			verb: 'Remove',
			clean: (raw) => {
				// Accept a pasted link: keep only the host.
				const host = raw
					.trim()
					.toLowerCase()
					.replace(/^[a-z]+:\/\//, '')
					.replace(/^www\./, '')
					.split(/[/?#]/)[0];
				return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
			},
			invalid: "That doesn't look like a site address"
		}
	};

	let spec = $derived(SPEC[kind]);
	let entries = $derived(kind === 'subreddits' ? subs : kind === 'users' ? users : kind === 'words' ? words : sites);

	function has(value: string): boolean {
		if (kind === 'users') return $blockedUsers.has(normalizeUser(value));
		return entries.includes(value);
	}

	function insert(k: Kind, value: string) {
		if (k === 'subreddits') filters.add('subreddits', value);
		else if (k === 'users') blockedUsers.block(value);
		else if (k === 'words') filters.add('keywords', value);
		else filters.add('domains', value);
	}

	function erase(k: Kind, value: string) {
		if (k === 'subreddits') filters.remove('subreddits', value);
		else if (k === 'users') blockedUsers.unblock(value);
		else if (k === 'words') filters.remove('keywords', value);
		else filters.remove('domains', value);
	}

	function show(k: Kind, value: string): string {
		return k === 'subreddits' ? `r/${value}` : k === 'users' ? `u/${value}` : value;
	}

	function add() {
		if (!draft.trim()) return;
		const value = spec.clean(draft);
		if (!value) {
			pushToast(spec.invalid, { key: 'muted-add', replace: true });
			return;
		}
		if (has(value)) {
			pushToast(`${show(kind, value)} is already on the list`, { key: 'muted-add', replace: true });
			draft = '';
			return;
		}
		insert(kind, value);
		draft = '';
	}

	function remove(value: string) {
		const k = kind;
		undoable({
			message: `${k === 'subreddits' ? 'Unmuted' : k === 'users' ? 'Unblocked' : 'Removed'} ${show(k, value)}`,
			perform: () => erase(k, value),
			undo: () => insert(k, value)
		});
	}

	// Subreddits and users are places you can go; words and sites are not.
	function open(value: string) {
		if (kind === 'subreddits') goto(`/r/${value}`);
		else if (kind === 'users') goto(`/u/${value}`);
	}
	let linked = $derived(kind === 'subreddits' || kind === 'users');
</script>

<TopAppBar title="Muted & blocked" showBack />

<Tabs {tabs} bind:value={kind} onchange={() => (draft = '')} />

<p class="explains">{spec.explains}</p>

<form
	class="add"
	onsubmit={(e) => {
		e.preventDefault();
		add();
	}}
>
	<label class="field">
		{#if spec.prefix}<span class="prefix">{spec.prefix}</span>{/if}
		<input
			type="text"
			bind:value={draft}
			placeholder={spec.placeholder}
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			aria-label={`Add to ${kind}`}
		/>
	</label>
	<button type="submit" class="add-btn" disabled={!draft.trim()}>Add</button>
</form>

{#if entries.length === 0}
	<EmptyState title={spec.emptyTitle} body={spec.emptyBody} />
{:else}
	<ul class="list">
		{#each entries as value (value)}
			<li class="row">
				{#if linked}
					<button class="name link" onclick={() => open(value)}>{show(kind, value)}</button>
				{:else}
					<span class="name">{show(kind, value)}</span>
				{/if}
				<button class="remove" onclick={() => remove(value)}>{spec.verb}</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.explains {
		margin: 0;
		padding: var(--space-lg) var(--space-lg) var(--space-sm);
		font-size: var(--type-secondary);
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
	}
	.add {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-lg) var(--space-md);
	}
	.field {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 22px;
		background: var(--md-sys-color-surface-container);
	}
	.field:focus-within {
		border-color: var(--md-sys-color-primary);
	}
	.prefix {
		flex: none;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--type-body);
	}
	.field input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: 0;
		background: none;
		color: var(--md-sys-color-on-surface);
		font: inherit;
		font-size: var(--type-body);
	}
	.add-btn {
		flex: none;
		height: 44px;
		padding: 0 20px;
		border-radius: 22px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--weight-title);
	}
	.add-btn:disabled {
		opacity: 0.4;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--md-sys-color-outline-variant);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		min-height: 52px;
		padding: 0 var(--space-sm) 0 var(--space-lg);
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.name {
		flex: 1;
		min-width: 0;
		padding: var(--space-md) 0;
		text-align: left;
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.remove {
		flex: none;
		padding: 8px 12px;
		border-radius: 16px;
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-primary);
	}
	.remove:active,
	.name.link:active {
		background: var(--md-sys-color-surface-container-high);
	}
</style>
