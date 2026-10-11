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
		onChange?: (value: T) => void; // fired only on a genuine user selection
	}

	let { value = $bindable(), options, label, align = 'right', onChange }: Props = $props();

	let open = $state(false);
	let triggerEl: HTMLButtonElement | undefined = $state();
	let rootEl: HTMLDivElement | undefined = $state();
	let menuEl: HTMLUListElement | undefined = $state();

	// The menu is positioned against the screen, not against the trigger's
	// container. Placed inside the container it was cut off by any ancestor
	// that clips (a rounded settings card), and ran off the bottom of the
	// screen when the trigger sat low. It opens downward if there is room and
	// upward if not, and scrolls inside itself when it is taller than either.
	let menuStyle = $state('');
	const GAP = 4;
	const MARGIN = 8;
	function place() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		const below = window.innerHeight - r.bottom - MARGIN - GAP;
		const above = r.top - MARGIN - GAP;
		const up = below < 220 && above > below;
		const side = align === 'left' ? `left:${Math.round(r.left)}px` : `right:${Math.round(window.innerWidth - r.right)}px`;
		const edge = up
			? `bottom:${Math.round(window.innerHeight - r.top + GAP)}px`
			: `top:${Math.round(r.bottom + GAP)}px`;
		menuStyle = `${side};${edge};max-height:${Math.max(96, Math.floor(up ? above : below))}px;min-width:${Math.max(140, Math.round(r.width))}px;transform-origin:${up ? 'bottom' : 'top'} ${align}`;
	}

	// It does not follow its trigger, so anything that moves the trigger
	// (scrolling the page, rotating) closes it.
	$effect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
			open = false;
		};
		window.addEventListener('scroll', close, { capture: true, passive: true });
		window.addEventListener('resize', close);
		return () => {
			window.removeEventListener('scroll', close, { capture: true });
			window.removeEventListener('resize', close);
		};
	});

	let normalized = $derived(
		options.map((o) =>
			typeof o === 'string'
				? { value: o as T, label: o as string }
				: { value: o.value, label: o.label ?? o.value }
		)
	);
	let currentLabel = $derived(normalized.find((o) => o.value === value)?.label ?? value);

	function toggle() {
		if (!open) place();
		open = !open;
	}

	function pick(v: T) {
		const changed = v !== value;
		value = v;
		open = false;
		triggerEl?.focus();
		if (changed) onChange?.(v);
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
			bind:this={menuEl}
			style={menuStyle}
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
		font-size: var(--type-body);
		cursor: pointer;
	}
	.trigger:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.value {
		text-transform: lowercase;
	}
	.menu {
		/* Placed by place(): edges, max-height, min-width, transform-origin. */
		position: fixed;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 4px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 10px;
		list-style: none;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
		z-index: 150;
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
		font-size: var(--type-body);
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
		font-weight: var(--weight-title);
	}
</style>
