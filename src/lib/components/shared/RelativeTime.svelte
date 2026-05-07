<script lang="ts">
	import { formatDateTime, formatRelativeTime } from '$lib/utils/format';

	interface Props {
		ts: number; // epoch seconds
	}

	let { ts }: Props = $props();

	// Guard against NaN / undefined / 0 — we used to call new Date(NaN).toISOString()
	// which throws RangeError and crashes the surrounding render tree.
	let valid = $derived(Number.isFinite(ts) && ts > 0);
	let iso = $derived(valid ? new Date(ts * 1000).toISOString() : '');
	let pretty = $derived(valid ? formatDateTime(ts) : '');
	let relative = $derived(valid ? formatRelativeTime(ts) : '—');
</script>

{#if valid}
	<time datetime={iso} title={pretty}>{relative}</time>
{:else}
	<span class="missing">—</span>
{/if}

<style>
	.missing {
		opacity: 0.5;
	}
</style>
