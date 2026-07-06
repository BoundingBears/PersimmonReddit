<script lang="ts">
	import { ICON_CODEPOINTS } from '$lib/content/iconCodepoints';

	interface Props {
		name: string;
		size?: number;
		filled?: boolean;
	}

	let { name, size = 24, filled = false }: Props = $props();

	// Render the icon by its codepoint from the bundled Material Symbols subset.
	// Falling back to the raw name keeps a never-mapped icon visible (as text)
	// rather than blank — but every icon the app uses is in the map.
	let glyph = $derived(ICON_CODEPOINTS[name] ?? name);
</script>

<span
	class="material-symbols-rounded"
	style:font-size="{size}px"
	style:font-variation-settings={filled ? "'FILL' 1" : "'FILL' 0"}
	aria-hidden="true">{glyph}</span>
