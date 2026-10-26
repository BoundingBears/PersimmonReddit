<script lang="ts">
	// The leaves at the top of a persimmon, seen from above: the mark from the
	// app icon, the lock screen and the launch animation.
	interface Props {
		size?: number;
	}

	let { size = 72 }: Props = $props();
</script>

<svg class="mark" viewBox="-50 -50 100 100" width={size} height={size} aria-hidden="true">
	<g fill="#567A2C">
		{#each [45, 135, 225, 315] as a (a)}
			<ellipse rx="19" ry="27" cy="-23" transform="rotate({a})" />
		{/each}
	</g>
	<g fill="#3A581E">
		{#each [0, 90, 180, 270] as a (a)}
			<ellipse rx="9" ry="13" cy="-11" transform="rotate({a})" />
		{/each}
	</g>
	<circle r="6" fill="#4A321E" />
</svg>
