<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import {
		whatsNewOpen,
		closeWhatsNew,
		WHATS_NEW_OVERLAY_KEY
	} from '$lib/stores/whatsNew';
	import { CHANGELOG } from '$lib/content/changelog';
	import { installIOSOverlayPopstate } from '$lib/utils/iosOverlay';

	onMount(() =>
		installIOSOverlayPopstate(
			WHATS_NEW_OVERLAY_KEY,
			() => get(whatsNewOpen),
			() => whatsNewOpen.set(false)
		)
	);

	$effect(() => {
		if (!$whatsNewOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	// The sheet is a headline for this version, not the project's history: it
	// shows the newest entry only. Older ones sit behind a toggle, collapsed
	// again each time the sheet opens.
	let latest = $derived(CHANGELOG[0]);
	let earlier = $derived(CHANGELOG.slice(1));
	let showEarlier = $state(false);
	$effect(() => {
		if (!$whatsNewOpen) showEarlier = false;
	});

	function slideUp(_node: HTMLElement, { duration = 240 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateY(${100 * u}%);`
		};
	}
</script>

{#if $whatsNewOpen && latest}
	<div class="scrim" onclick={closeWhatsNew} role="presentation" transition:fade={{ duration: 150 }}></div>
	<aside class="sheet" aria-label="What's new" transition:slideUp={{ duration: 240 }}>
		<div class="grab"></div>
		<header class="head">
			<div class="title">What's new</div>
			<div class="version">Persimmon v{latest.version}</div>
		</header>
		<div class="body">
			<ul class="items">
				{#each latest.items as item (item)}
					<li>{item}</li>
				{/each}
			</ul>
			{#if earlier.length > 0}
				<button class="earlier-toggle" onclick={() => (showEarlier = !showEarlier)} aria-expanded={showEarlier}>
					<span>Earlier versions</span>
					<Icon name={showEarlier ? 'expand_less' : 'expand_more'} size={18} />
				</button>
				{#if showEarlier}
					{#each earlier as entry (entry.version)}
						<div class="entry-title">v{entry.version}</div>
						<ul class="items compact">
							{#each entry.items as item (item)}
								<li>{item}</li>
							{/each}
						</ul>
					{/each}
				{/if}
			{/if}
		</div>
		<button class="done" onclick={closeWhatsNew}>
			<Icon name="check" size={18} />
			<span>Got it</span>
		</button>
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
	.head {
		padding: 8px 20px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
		flex: none;
	}
	.title {
		font-size: var(--type-headline);
		font-weight: var(--weight-heading);
		color: var(--md-sys-color-primary);
	}
	.version {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 2px;
	}
	.body {
		overflow-y: auto;
		padding: 14px 20px 8px;
	}
	.entry-title {
		font-size: var(--type-meta);
		font-weight: var(--weight-heading);
		color: var(--md-sys-color-on-surface-variant);
		margin: 12px 0 4px;
	}
	.earlier-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 14px;
		padding: 6px 0;
		font: inherit;
		font-size: var(--type-secondary);
		color: var(--md-sys-color-on-surface-variant);
	}
	.items.compact {
		gap: 4px;
	}
	.items.compact li {
		font-size: var(--type-secondary);
		color: var(--md-sys-color-on-surface-variant);
	}
	.items {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.items li {
		font-size: var(--type-body);
		line-height: 1.45;
	}
	.done {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 8px 16px 16px;
		padding: 12px;
		border-radius: 12px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: inherit;
		font-size: var(--type-body-lg);
		font-weight: var(--weight-title);
		flex: none;
	}
	.done:active {
		background: var(--md-sys-color-primary);
		opacity: 0.9;
	}
</style>
