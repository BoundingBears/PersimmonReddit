<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { updateAvailable, dismissUpdate, clearUpdateBanner } from '$lib/stores/updateCheck';
	import { openExternal } from '$lib/utils/openExternal';

	async function update() {
		const info = $updateAvailable;
		if (!info) return;
		// Only close the banner once the release page actually opened — if the
		// browser failed to launch, leave it up so the user can retry.
		if (await openExternal(info.url)) clearUpdateBanner();
	}
</script>

{#if $updateAvailable}
	<div class="update-banner">
		<Icon name="system_update" size={18} />
		<span class="msg">Persimmon v{$updateAvailable.version} is available</span>
		<button class="update" onclick={update}>Update</button>
		<button class="dismiss" onclick={dismissUpdate} aria-label="Dismiss update">
			<Icon name="close" size={18} />
		</button>
	</div>
{/if}

<style>
	.update-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px;
		padding: 8px 8px 8px 12px;
		border-radius: 10px;
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font-size: 13px;
	}
	.msg {
		flex: 1;
		min-width: 0;
	}
	.update {
		padding: 6px 14px;
		border-radius: 16px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		flex: none;
	}
	.dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 16px;
		color: inherit;
		flex: none;
	}
	.dismiss:active {
		background: color-mix(in srgb, var(--md-sys-color-on-primary-container) 14%, transparent);
	}
</style>
