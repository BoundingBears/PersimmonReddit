<script lang="ts">
	// Third-party video (YouTube, Twitch, Streamable, Vimeo, or whatever Reddit
	// handed us an embed for).
	//
	// Tap to load: until the user taps, this is just Reddit's preview image with
	// a play button, so no request reaches the provider and the heavy player
	// script is not downloaded for a post you only opened to read comments. The
	// tap is also the user gesture the player needs to start with sound.
	import DOMPurify from 'dompurify';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { openExternal } from '$lib/utils/openExternal';
	import type { Embed } from '$lib/reddit/types';
	import type { DirectEmbed } from '$lib/reddit/embeds';

	interface Props {
		/** A provider embed we built ourselves. Preferred when available. */
		direct?: DirectEmbed | null;
		/** Reddit's own embed HTML, used when we do not know the provider. */
		embed?: Embed;
		poster?: string;
		/** The outbound link, for the "open" escape hatch. */
		url: string;
		domain: string;
	}

	let { direct = null, embed, poster, url, domain }: Props = $props();

	let active = $state(false);

	const PROVIDER_LABEL: Record<DirectEmbed['provider'], string> = {
		youtube: 'YouTube',
		twitch: 'Twitch',
		streamable: 'Streamable',
		vimeo: 'Vimeo'
	};
	let label = $derived(direct ? PROVIDER_LABEL[direct.provider] : domain);

	// Reddit's media_embed.content is an iframe HTML string. Sanitize but keep
	// the iframe, that being the point of an embed.
	let safeHtml = $derived(
		!direct && embed
			? DOMPurify.sanitize(embed.html, {
					ADD_TAGS: ['iframe'],
					ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'loading', 'referrerpolicy', 'sandbox']
				})
			: ''
	);

	// height / width
	let aspect = $derived(
		direct ? direct.aspect : embed && embed.width && embed.height ? embed.height / embed.width : 9 / 16
	);
</script>

<div class="embed" style:aspect-ratio={`1 / ${aspect}`}>
	{#if active}
		{#if direct}
			<iframe
				src={direct.src}
				title={label}
				allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
				allowfullscreen
				referrerpolicy="strict-origin-when-cross-origin"
			></iframe>
		{:else}
			{@html safeHtml}
		{/if}
	{:else}
		<button class="facade" onclick={() => (active = true)} aria-label={`Play ${label} video`}>
			{#if poster}
				<img src={poster} alt="" referrerpolicy="no-referrer" />
			{/if}
			<span class="play"><Icon name="play_arrow" size={40} filled /></span>
			<span class="provider">{label}</span>
		</button>
		<!-- Escape hatch for a player that will not load. Facade only: once
		     playing, the provider's own controls occupy this corner. -->
		<button class="open" onclick={() => openExternal(url)} aria-label={`Open on ${label}`}>
			<Icon name="open_in_new" size={18} />
		</button>
	{/if}
</div>

<style>
	.embed {
		position: relative;
		width: 100%;
		/* Same cap VideoView uses, so a portrait Short letterboxes instead of
		   pushing the comments off the screen. */
		max-height: 50vh;
		background: #000;
		overflow: hidden;
	}
	.embed :global(iframe) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: #000;
	}
	.facade {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		color: #fff;
	}
	.facade img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.play {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 68px;
		height: 68px;
		border-radius: 34px;
		background: rgba(0, 0, 0, 0.6);
	}
	.facade:active .play {
		background: rgba(0, 0, 0, 0.8);
	}
	.provider {
		position: absolute;
		left: 10px;
		bottom: 10px;
		padding: 3px 8px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.6);
		font-size: var(--type-caption);
		font-weight: var(--weight-title);
		letter-spacing: 0.2px;
	}
	.open {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 18px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
	}
</style>
