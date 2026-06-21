<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import RelativeTime from './RelativeTime.svelte';
	import SelfText from '$lib/components/post/SelfText.svelte';
	import {
		subredditInfoState,
		closeSubredditInfo,
		SUBREDDIT_INFO_OVERLAY_KEY
	} from '$lib/stores/subredditInfo';
	import { getSubreddit, getSubredditRules } from '$lib/reddit/endpoints';
	import { formatScore } from '$lib/utils/format';
	import { installIOSOverlayPopstate } from '$lib/utils/iosOverlay';
	import type { Subreddit, SubredditRule } from '$lib/reddit/types';

	onMount(() =>
		installIOSOverlayPopstate(
			SUBREDDIT_INFO_OVERLAY_KEY,
			() => get(subredditInfoState) !== null,
			() => subredditInfoState.set(null)
		)
	);

	let sub = $derived($subredditInfoState?.sub ?? '');

	let info = $state<Subreddit | null>(null);
	let rules = $state<SubredditRule[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let openRule = $state<number | null>(null);
	let loadedFor = '';

	// Fetch about + rules when a (new) sub is opened. The reddit client's 60s
	// cache makes re-opening the same sub cheap.
	$effect(() => {
		const s = sub;
		if (!s || s === loadedFor) return;
		loadedFor = s;
		info = null;
		rules = [];
		error = null;
		openRule = null;
		loading = true;
		Promise.all([getSubreddit(s), getSubredditRules(s)])
			.then(([about, rulesRes]) => {
				if (about.ok) info = about.data;
				else error = about.error.message;
				if (rulesRes.ok) rules = rulesRes.data;
			})
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	$effect(() => {
		if (!$subredditInfoState) {
			loadedFor = ''; // allow a fresh fetch next open
			return;
		}
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function slideUp(_node: HTMLElement, { duration = 220 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateY(${100 * u}%);`
		};
	}
</script>

{#if $subredditInfoState}
	<div class="scrim" onclick={closeSubredditInfo} role="presentation" transition:fade={{ duration: 150 }}></div>
	<aside class="sheet" aria-label="Subreddit info" transition:slideUp={{ duration: 220 }}>
		<div class="grab"></div>
		<div class="body">
			<header class="head">
				{#if info?.iconImg || info?.communityIcon}
					<img class="icon" src={info.iconImg || info.communityIcon} alt="" referrerpolicy="no-referrer" />
				{:else}
					<div class="icon placeholder"><Icon name="forum" size={22} /></div>
				{/if}
				<div class="head-text">
					<div class="name">r/{sub}</div>
					{#if info}
						<div class="stats">
							{formatScore(info.subscribers)} members
							{#if info.activeUserCount > 0}· {formatScore(info.activeUserCount)} online{/if}
						</div>
					{/if}
				</div>
			</header>

			{#if loading}
				<div class="status">Loading…</div>
			{:else if error && !info}
				<div class="status">Couldn't load this subreddit ({error}).</div>
			{:else if info}
				{#if info.title}<div class="title">{info.title}</div>{/if}
				{#if info.createdUtc}
					<div class="created">Created <RelativeTime ts={info.createdUtc} /></div>
				{/if}
				{#if info.descriptionHtml || info.publicDescription}
					<div class="desc">
						{#if info.descriptionHtml}
							<SelfText html={info.descriptionHtml} />
						{:else}
							<p>{info.publicDescription}</p>
						{/if}
					</div>
				{/if}

				{#if rules.length > 0}
					<div class="rules-title">Rules</div>
					<ul class="rules">
						{#each rules as rule, i (i)}
							<li>
								<button class="rule-head" onclick={() => (openRule = openRule === i ? null : i)}>
									<span class="rule-num">{i + 1}</span>
									<span class="rule-name">{rule.shortName}</span>
									<Icon name={openRule === i ? 'expand_less' : 'expand_more'} size={20} />
								</button>
								{#if openRule === i && (rule.descriptionHtml || rule.description)}
									<div class="rule-body">
										{#if rule.descriptionHtml}
											<SelfText html={rule.descriptionHtml} />
										{:else}
											<SelfText md={rule.description} />
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 170;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 171;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		padding-bottom: env(safe-area-inset-bottom);
		max-height: 84vh;
		display: flex;
		flex-direction: column;
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
	.body {
		overflow-y: auto;
		padding: 8px 20px 20px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 12px;
	}
	.icon {
		width: 44px;
		height: 44px;
		border-radius: 22px;
		object-fit: cover;
		flex: none;
		background: var(--md-sys-color-surface-container-high);
	}
	.icon.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.name {
		font-size: 17px;
		font-weight: 600;
	}
	.stats {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 2px;
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 4px;
	}
	.created {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-bottom: 8px;
	}
	.desc {
		font-size: 14px;
		line-height: 1.5;
		border-top: 1px solid var(--md-sys-color-outline-variant);
		padding-top: 10px;
	}
	.status {
		padding: 24px 0;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
		font-size: 13px;
	}
	.rules-title {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--md-sys-color-on-surface-variant);
		margin: 16px 0 6px;
	}
	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.rules li {
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.rule-head {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 0;
		background: transparent;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	.rule-num {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 11px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 600;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.rule-name {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
	}
	.rule-body {
		padding: 0 0 12px 32px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
