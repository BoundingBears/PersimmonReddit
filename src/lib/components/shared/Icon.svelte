<script lang="ts">
	interface Props {
		name: string;
		size?: number;
		filled?: boolean;
	}

	let { name, size = 24, filled = false }: Props = $props();
</script>

<span
	class="material-symbols-rounded"
	style:font-size="{size}px"
	style:font-variation-settings={filled ? "'FILL' 1" : "'FILL' 0"}
	aria-hidden="true">{name}</span>
