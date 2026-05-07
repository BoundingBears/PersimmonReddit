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
	<a class="chip" href="/u/{name}" onclick={(e) => e.stopPropagation()}>
		u/{name}
	</a>
{/if}

<style>
	.chip {
		color: var(--md-sys-color-on-surface-variant);
	}
	.chip:hover:not(.deleted) {
		text-decoration: underline;
		color: var(--md-sys-color-on-surface);
	}
	.deleted {
		font-style: italic;
		color: var(--md-sys-color-outline);
	}
</style>
