<script lang="ts">
	interface Props {
		name: string;
	}

	let { name }: Props = $props();
	let isDeleted = $derived(name === '[deleted]' || name === '[removed]');
</script>

{#if isDeleted}
	<span class="chip deleted">{name}</span>
{:else}
	<a class="chip" href="/u/{name}">
		u/{name}
	</a>
{/if}

<style>
	.chip {
		color: var(--md-sys-color-on-surface-variant);
		text-decoration: underline;
		text-decoration-color: var(--md-sys-color-outline-variant);
		text-underline-offset: 2px;
	}
	.chip:active:not(.deleted) {
		color: var(--md-sys-color-on-surface);
	}
	.deleted {
		text-decoration: none;
	}
	.deleted {
		font-style: italic;
		color: var(--md-sys-color-outline);
	}
</style>
