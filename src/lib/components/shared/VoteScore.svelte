<script lang="ts">
	import Icon from './Icon.svelte';
	import { formatScore } from '$lib/utils/format';

	interface Props {
		score: number;
		hidden?: boolean;
	}

	let { score, hidden = false }: Props = $props();
</script>

<span class="vote">
	<Icon name="arrow_upward" size={18} />
	<span>{hidden ? '—' : formatScore(score)}</span>
</span>

<style>
	.vote {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--md-sys-color-on-surface-variant);
		font-weight: 500;
		font-size: 13px;
	}
</style>
