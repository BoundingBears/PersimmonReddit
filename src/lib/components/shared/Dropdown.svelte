<script lang="ts" generics="T extends string">
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';

	interface Option {
		value: T;
		label?: string;
	}

	interface Props {
		value: T;
		options: ReadonlyArray<T | Option>;
		label?: string;
		align?: 'left' | 'right';
	}

	let { value = $bindable(), options, label, align = 'right' }: Props = $props();

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let rootEl: HTMLDivElement | undefined = $state();

	let normalized = $derived(
		options.map((o) =>
			typeof o === 'string'
				? { value: o as T, label: o as string }
				: { value: o.value, label: o.label ?? o.value }
		)
	);
	let currentLabel = $derived(normalized.find((o) => o.value === value)?.label ?? value);

	function toggle() {
		open = !open;
	}

	function pick(v: T) {
		value = v;
		open = false;
		triggerEl?.focus();
	}

	function onWindowPointerdown(e: PointerEvent) {
		if (!open) return;
		const t = e.target as Node | null;
		if (rootEl && t && rootEl.contains(t)) return;
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			triggerEl?.focus();
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} onkeydown={onKeydown} />

<div class="dropdown" bind:this={rootEl}>
	<button
		bind:this={triggerEl}
		type="button"
		class="trigger"
		onclick={toggle}
		aria-label={label}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<span class="value">{currentLabel}</span>
		<Icon name="arrow_drop_down" size={18} />
	</button>
	{#if open}
		<ul
			class="menu"
			class:left={align === 'left'}
			role="listbox"
			transition:scale={{ duration: 120, start: 0.94, opacity: 0, easing: cubicOut }}
		>
			{#each normalized as opt (opt.value)}
				<li role="option" aria-selected={value === opt.value}>
					<button
						type="button"
						class="option"
						class:active={value === opt.value}
						onclick={() => pick(opt.value)}
					>
						{opt.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
		display: inline-block;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 4px 4px 4px 10px;
		min-height: 32px;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 8px;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.trigger:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.value {
		text-transform: lowercase;
	}
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 100%;
		margin: 0;
		padding: 4px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 10px;
		list-style: none;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
		z-index: 50;
		transform-origin: top right;
		min-width: 140px;
	}
	.menu.left {
		right: auto;
		left: 0;
		transform-origin: top left;
	}
	.option {
		display: block;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		color: inherit;
		border: 0;
		border-radius: 6px;
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
		text-transform: lowercase;
	}
	.option:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.option.active {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font-weight: 500;
	}
</style>
