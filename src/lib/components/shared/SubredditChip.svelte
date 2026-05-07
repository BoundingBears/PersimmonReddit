<script lang="ts">
	interface Props {
		name: string;
	}

	let { name }: Props = $props();
</script>

<a class="chip" href="/r/{name}" onclick={(e) => e.stopPropagation()}>
	r/{name}
</a>

<style>
	.chip {
		font-weight: 500;
		color: var(--md-sys-color-on-surface);
	}
	.chip:hover {
		text-decoration: underline;
	}
</style>
