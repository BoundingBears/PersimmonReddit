<script lang="ts">
	import DOMPurify from 'dompurify';
	import type { Embed } from '$lib/reddit/types';

	interface Props {
		embed: Embed;
	}

	let { embed }: Props = $props();

	// Reddit's media_embed.content is already an iframe HTML string. Sanitize but
	// keep iframes — that's the point of an embed.
	let safeHtml = $derived(
		DOMPurify.sanitize(embed.html, {
			ADD_TAGS: ['iframe'],
			ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'loading', 'referrerpolicy', 'sandbox']
		})
	);

	let aspect = $derived(embed.width && embed.height ? embed.height / embed.width : 9 / 16);
</script>

<div class="embed" style:--aspect={aspect}>
	{@html safeHtml}
</div>

<style>
	.embed {
		position: relative;
		width: 100%;
		padding-top: calc(var(--aspect) * 100%);
		background: #000;
	}
	.embed :global(iframe) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}
</style>
