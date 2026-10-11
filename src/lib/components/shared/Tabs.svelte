<script lang="ts" generics="T extends string">
	// The one tab bar. Search and the profile page each carried an identical
	// copy of this markup and CSS; the Muted & blocked screen would have been a
	// third.
	interface Tab {
		value: T;
		label: string;
		/** Shown after the label when above zero, e.g. how many are in a list. */
		count?: number;
	}
	interface Props {
		tabs: ReadonlyArray<Tab>;
		value: T;
		onchange?: (value: T) => void;
	}

	let { tabs, value = $bindable(), onchange }: Props = $props();

	function pick(next: T) {
		if (next === value) return;
		value = next;
		onchange?.(next);
	}
</script>

<div class="tabs" role="tablist">
	{#each tabs as t (t.value)}
		<button class="tab" class:active={value === t.value} role="tab" aria-selected={value === t.value} onclick={() => pick(t.value)}>
			<span>{t.label}</span>
			{#if t.count}<span class="count">{t.count}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.tab {
		flex: 1;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 4px;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface-variant);
		border-bottom: 2px solid transparent;
	}
	.tab.active {
		color: var(--md-sys-color-primary);
		border-bottom-color: var(--md-sys-color-primary);
	}
	.count {
		min-width: 18px;
		padding: 0 5px;
		border-radius: 9px;
		font-size: var(--type-caption);
		line-height: 18px;
		text-align: center;
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface-variant);
	}
	.tab.active .count {
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}
</style>
