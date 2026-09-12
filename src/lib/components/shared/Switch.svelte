<script lang="ts">
	// Material 3 switch. The app is M3 everywhere else but Settings was still
	// rendering raw <input type="checkbox">, which the WebView draws with the
	// platform default — a small blue tick that matches nothing.
	//
	// The real <input> is kept (visually hidden, not display:none) so the label
	// wrapper, keyboard focus, and screen readers all keep working; the track and
	// thumb are painted from it via :checked/:focus-visible sibling selectors.
	import Icon from './Icon.svelte';

	interface Props {
		checked: boolean;
		disabled?: boolean;
		/** Accessible name, when the switch isn't already inside a <label>. */
		label?: string;
		onchange?: (checked: boolean) => void;
	}

	let { checked = $bindable(), disabled = false, label, onchange }: Props = $props();
</script>

<span class="switch" class:disabled>
	<input
		type="checkbox"
		bind:checked
		{disabled}
		aria-label={label}
		onchange={(e) => onchange?.((e.currentTarget as HTMLInputElement).checked)}
	/>
	<span class="track" aria-hidden="true">
		<span class="thumb">
			{#if checked}<Icon name="check" size={14} />{/if}
		</span>
	</span>
</span>

<style>
	.switch {
		position: relative;
		display: inline-flex;
		flex: none;
		width: 52px;
		height: 32px;
	}
	/* Visually hidden but still focusable and hit-testable. */
	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		z-index: 1;
	}
	.switch.disabled input {
		cursor: default;
	}
	.track {
		position: absolute;
		inset: 0;
		border-radius: 16px;
		background: var(--md-sys-color-surface-container-highest);
		border: 2px solid var(--md-sys-color-outline);
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}
	.thumb {
		position: absolute;
		top: 50%;
		left: 6px;
		width: 16px;
		height: 16px;
		margin-top: -8px;
		border-radius: 50%;
		background: var(--md-sys-color-outline);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--md-sys-color-surface-container-highest);
		transition:
			transform 120ms cubic-bezier(0.2, 0, 0, 1),
			width 120ms cubic-bezier(0.2, 0, 0, 1),
			height 120ms cubic-bezier(0.2, 0, 0, 1),
			margin 120ms cubic-bezier(0.2, 0, 0, 1),
			background 120ms ease;
	}
	/* Checked: filled track, larger white thumb carrying a check glyph. */
	input:checked + .track {
		background: var(--md-sys-color-primary);
		border-color: var(--md-sys-color-primary);
	}
	input:checked + .track .thumb {
		width: 24px;
		height: 24px;
		margin-top: -12px;
		transform: translateX(18px);
		background: var(--md-sys-color-on-primary);
		color: var(--md-sys-color-primary);
	}
	input:focus-visible + .track {
		outline: 2px solid var(--md-sys-color-primary);
		outline-offset: 2px;
	}
	.switch.disabled .track {
		opacity: 0.38;
	}
</style>
