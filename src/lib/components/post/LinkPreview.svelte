<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { prefs } from '$lib/stores/prefs';
	import { Browser } from '@capacitor/browser';
	import { IS_NATIVE } from '$lib/utils/platform';

	interface Props {
		url: string;
		domain: string;
		thumbnail?: string;
	}

	let { url, domain, thumbnail }: Props = $props();

	async function open() {
		if (!url) return;
		if ($prefs.openLinksInBrowser && IS_NATIVE) {
			await Browser.open({ url, presentationStyle: 'popover' });
		} else {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	}
</script>

<button class="link" onclick={open}>
	{#if thumbnail}
		<img src={thumbnail} alt="" referrerpolicy="no-referrer" />
	{:else}
		<div class="placeholder"><Icon name="link" size={28} /></div>
	{/if}
	<div class="meta">
		<div class="domain">{domain}</div>
		<div class="url">{url}</div>
	</div>
	<Icon name="open_in_new" size={20} />
</button>

<style>
	.link {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px;
		background: var(--md-sys-color-surface-container);
		border-radius: 12px;
		text-align: left;
		color: var(--md-sys-color-on-surface);
	}
	.link:active {
		background: var(--md-sys-color-surface-container-high);
	}
	img {
		width: 56px;
		height: 56px;
		border-radius: 8px;
		object-fit: cover;
		flex: none;
	}
	.placeholder {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--md-sys-color-surface-container-high);
		border-radius: 8px;
		flex: none;
		color: var(--md-sys-color-on-surface-variant);
	}
	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.domain {
		font-weight: 500;
		font-size: 14px;
	}
	.url {
		font-size: 11px;
		color: var(--md-sys-color-on-surface-variant);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
