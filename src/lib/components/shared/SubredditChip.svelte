<script lang="ts">
	interface Props {
		name: string;
	}

	let { name }: Props = $props();
</script>

<a class="chip" href="/r/{name}">
	r/{name}
</a>

<style>
	.chip {
		font-weight: 500;
		color: var(--md-sys-color-on-surface);
		text-decoration: underline;
		text-decoration-color: var(--md-sys-color-outline-variant);
		text-underline-offset: 2px;
	}
	.chip:active {
		text-decoration-color: var(--md-sys-color-primary);
	}
</style>
