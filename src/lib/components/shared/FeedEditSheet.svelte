<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import {
		feedEditState,
		closeFeedEdit,
		dismissFeedEditForNavigation,
		FEED_EDIT_OVERLAY_KEY
	} from '$lib/stores/feedEdit';
	import { subscribed } from '$lib/stores/subscribed';
	import { groups } from '$lib/stores/groups';
	import { dismissDrawerForNavigation } from '$lib/stores/drawer';
	import { installIOSOverlayPopstate } from '$lib/utils/iosOverlay';

	// iOS swipe-from-left-edge fires popstate; the store pushed a marker on open.
	onMount(() =>
		installIOSOverlayPopstate(
			FEED_EDIT_OVERLAY_KEY,
			() => get(feedEditState) !== null,
			() => feedEditState.set(null)
		)
	);

	let isNew = $derived($feedEditState != null && $feedEditState.name === null);
	let editName = $derived($feedEditState?.name ?? '');

	let name = $state('');
	let nameError = $state(false);
	let selected = $state(new Set<string>()); // lowercased sub names
	// Group members that aren't in the current subscription list — kept in the
	// checklist so editing doesn't silently drop them on save.
	let extraSubs = $state<string[]>([]);

	// Initialise once per open. Read subscribed via get()/untrack so a
	// subscription change while the sheet is open can't reset the user's edits.
	$effect(() => {
		const st = $feedEditState;
		if (!st) return;
		untrack(() => {
			nameError = false;
			if (st.name) {
				const g = groups.get(st.name);
				const subs = g?.subreddits ?? [];
				name = g?.name ?? '';
				selected = new Set(subs.map((s) => s.toLowerCase()));
				const subbed = new Set(get(subscribed).map((s) => s.name.toLowerCase()));
				extraSubs = subs.filter((s) => !subbed.has(s.toLowerCase()));
			} else {
				name = '';
				selected = new Set();
				extraSubs = [];
			}
		});
	});

	// The checklist: subscribed subs first, then any non-subscribed group members.
	let rows = $derived.by(() => {
		const list = $subscribed.map((s) => ({ name: s.name, icon: s.iconImg }));
		const have = new Set(list.map((r) => r.name.toLowerCase()));
		for (const s of extraSubs) {
			if (!have.has(s.toLowerCase())) list.push({ name: s, icon: undefined });
		}
		return list;
	});

	function toggle(subName: string) {
		const l = subName.toLowerCase();
		const next = new Set(selected);
		if (next.has(l)) next.delete(l);
		else next.add(l);
		selected = next;
	}

	function subsFromSelected(): string[] {
		return rows.filter((r) => selected.has(r.name.toLowerCase())).map((r) => r.name);
	}

	function save() {
		if (isNew) {
			const trimmed = name.trim();
			if (!trimmed) return;
			if (groups.get(trimmed)) {
				nameError = true;
				return;
			}
			groups.create(trimmed);
			groups.setSubreddits(trimmed, subsFromSelected());
			// Created → drop straight into the new feed.
			dismissFeedEditForNavigation();
			dismissDrawerForNavigation();
			goto(`/g/${trimmed}`);
		} else {
			if (!editName) return;
			groups.setSubreddits(editName, subsFromSelected());
			closeFeedEdit();
		}
	}

	function del() {
		if (!editName) return;
		groups.remove(editName);
		closeFeedEdit();
	}

	function slideUp(_node: HTMLElement, { duration = 220 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateY(${100 * u}%);`
		};
	}
</script>

{#if $feedEditState}
	<div class="scrim" onclick={closeFeedEdit} role="presentation" transition:fade={{ duration: 150 }}></div>
	<aside class="sheet" aria-label={isNew ? 'New feed' : 'Edit feed'} transition:slideUp={{ duration: 220 }}>
		<div class="grab"></div>
		<div class="header">
			<div class="title">{isNew ? 'New custom feed' : `Edit ${editName}`}</div>
			<div class="meta">
				Tap subreddits to include{selected.size ? ` · ${selected.size} selected` : ''}
			</div>
		</div>

		{#if isNew}
			<div class="namefield">
				<input
					type="text"
					bind:value={name}
					placeholder="Feed name (e.g. News)"
					oninput={() => (nameError = false)}
				/>
				{#if nameError}<div class="err">A feed with that name already exists.</div>{/if}
			</div>
		{/if}

		{#if rows.length === 0}
			<div class="hint">
				You have no subscriptions yet. Bookmark a few subreddits, then add them to a feed here.
			</div>
		{:else}
			<ul class="checklist">
				{#each rows as r (r.name)}
					{@const on = selected.has(r.name.toLowerCase())}
					<li>
						<button class="check-row" class:on onclick={() => toggle(r.name)} aria-pressed={on}>
							<Icon name={on ? 'check_box' : 'check_box_outline_blank'} size={22} />
							{#if r.icon}
								<img class="sub-icon" src={r.icon} alt="" referrerpolicy="no-referrer" />
							{:else}
								<Icon name="forum" size={20} />
							{/if}
							<span>r/{r.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="footer">
			{#if !isNew}
				<button class="del" onclick={del} aria-label="Delete feed">
					<Icon name="delete" size={20} />
				</button>
			{/if}
			<span class="spacer"></span>
			<button class="cancel" onclick={closeFeedEdit}>Cancel</button>
			<button class="save" disabled={isNew && !name.trim()} onclick={save}>
				{isNew ? 'Create' : 'Save'}
			</button>
		</div>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 160;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 161;
		display: flex;
		flex-direction: column;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		padding-bottom: env(safe-area-inset-bottom);
		max-height: 82vh;
		box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
	}
	.grab {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--md-sys-color-outline-variant);
		margin: 8px auto 4px;
		flex: none;
	}
	.header {
		padding: 8px 20px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
		flex: none;
	}
	.title {
		font-size: 16px;
		font-weight: 600;
	}
	.meta {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 4px;
	}
	.namefield {
		padding: 12px 20px 4px;
		flex: none;
	}
	.namefield input {
		width: 100%;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--md-sys-color-outline-variant);
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font: inherit;
		font-size: 15px;
	}
	.namefield input:focus {
		outline: 2px solid var(--md-sys-color-primary);
		outline-offset: -1px;
	}
	.err {
		margin-top: 6px;
		font-size: 12px;
		color: var(--md-sys-color-error);
	}
	.hint {
		padding: 24px 20px;
		font-size: 13px;
		color: var(--md-sys-color-on-surface-variant);
		text-align: center;
	}
	.checklist {
		list-style: none;
		margin: 0;
		padding: 4px 0;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}
	.check-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 20px;
		text-align: left;
		font: inherit;
		font-size: 15px;
		color: var(--md-sys-color-on-surface-variant);
		background: transparent;
		border: 0;
	}
	.check-row.on {
		color: var(--md-sys-color-on-surface);
	}
	.check-row.on :global(.material-symbols-rounded:first-child) {
		color: var(--md-sys-color-primary);
	}
	.check-row:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.sub-icon {
		width: 22px;
		height: 22px;
		border-radius: 11px;
		object-fit: cover;
		flex: none;
	}
	.check-row span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-top: 1px solid var(--md-sys-color-outline-variant);
		flex: none;
	}
	.spacer {
		flex: 1;
	}
	.del {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 20px;
		color: var(--md-sys-color-error);
	}
	.del:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.cancel {
		padding: 9px 16px;
		border-radius: 20px;
		font: inherit;
		font-size: 14px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.save {
		padding: 9px 20px;
		border-radius: 20px;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.save:disabled {
		opacity: 0.4;
	}
</style>
