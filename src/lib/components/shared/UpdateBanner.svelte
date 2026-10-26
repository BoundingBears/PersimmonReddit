<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import { updateAvailable, dismissUpdate, openUpdateSheet } from '$lib/stores/updateCheck';
	import { installState, startUpdate } from '$lib/stores/updateInstall';

	let downloading = $derived($installState?.stage === 'downloading');
	let installing = $derived($installState?.stage === 'installing');
	let percent = $derived($installState?.stage === 'downloading' ? $installState.percent : 0);
	let label = $derived(
		installing ? 'Opening…' : downloading ? `${percent}%` : 'Update'
	);
</script>

{#if $updateAvailable}
	<div class="update-banner">
		<Icon name="system_update" size={18} />
		<!-- The words open the sheet with what is new; the button just updates. -->
		<button class="msg" onclick={openUpdateSheet}>
			{#if downloading || installing}
				Downloading v{$updateAvailable.version}…
			{:else}
				Persimmon v{$updateAvailable.version} is available
			{/if}
		</button>
		<button class="update" onclick={() => startUpdate()} disabled={downloading || installing}>
			{label}
		</button>
		{#if !downloading && !installing}
			<button class="dismiss" onclick={dismissUpdate} aria-label="Dismiss update">
				<Icon name="close" size={18} />
			</button>
		{/if}
	</div>
	{#if downloading}
		<div class="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
			<div class="bar" style:width="{percent}%"></div>
		</div>
	{/if}
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
		font-size: var(--type-secondary);
	}
	.msg {
		flex: 1;
		min-width: 0;
		padding: 4px 0;
		text-align: left;
		color: inherit;
		font: inherit;
		background: none;
		border: 0;
	}
	.update {
		padding: 6px 14px;
		border-radius: 16px;
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-heading);
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
	.update:disabled {
		opacity: 0.7;
	}
	.progress {
		height: 3px;
		margin: -4px 8px 8px;
		border-radius: 2px;
		overflow: hidden;
		background: color-mix(in srgb, var(--md-sys-color-on-primary-container) 20%, transparent);
	}
	.bar {
		height: 100%;
		background: var(--md-sys-color-primary);
		transition: width 120ms linear;
	}
</style>
