<script lang="ts">
	// "Update available": what is new in the release and the choice about it,
	// after Mihon's update screen. Opened by itself when a check finds a version
	// the user has not skipped (updateCheck.ts), and from the banner or the
	// Settings row.
	//
	//   Update            downloads, with the progress in the button, then hands
	//                     the file to Android's installer
	//   Not now           closes; the banner stays, and the sheet asks again the
	//                     next time the app is opened
	//   Skip this version no sheet and no banner for this version (asks twice)
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import PersimmonMark from './PersimmonMark.svelte';
	import SelfText from '$lib/components/post/SelfText.svelte';
	import { knownUpdate, updateAvailable, updateSheetOpen, skipUpdate } from '$lib/stores/updateCheck';
	import { allowInstalls, installState, startUpdate } from '$lib/stores/updateInstall';
	import { openExternal } from '$lib/utils/openExternal';

	let info = $derived($updateAvailable ?? $knownUpdate);
	let downloading = $derived($installState?.stage === 'downloading');
	let installing = $derived($installState?.stage === 'installing');
	let needsPermission = $derived($installState?.stage === 'needs-permission');
	let failed = $derived($installState?.stage === 'error');
	let percent = $derived($installState?.stage === 'downloading' ? $installState.percent : 0);
	let busy = $derived(downloading || installing);

	// "Skip" asks once more before it means it.
	let confirmSkip = $state(false);
	$effect(() => {
		if (!$updateSheetOpen) confirmSkip = false;
	});

	$effect(() => {
		if (!$updateSheetOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function close() {
		if (!busy) updateSheetOpen.set(false);
	}

	function primary() {
		if (needsPermission) void allowInstalls();
		else void startUpdate(info);
	}

	function skip() {
		if (!confirmSkip) {
			confirmSkip = true;
			return;
		}
		skipUpdate();
	}

	function slideUp(_node: HTMLElement, { duration = 240 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateY(${100 * u}%);`
		};
	}
</script>

{#if $updateSheetOpen && info}
	<div class="scrim" onclick={close} role="presentation" transition:fade={{ duration: 150 }}></div>
	<aside class="sheet" aria-label="Update available" transition:slideUp={{ duration: 240 }}>
		<div class="grab"></div>
		<header class="head">
			<!-- The app's own mark on its orange, like the app icon: it reads as
			     "Persimmon has a new version", not as any app's update. -->
			<span class="badge"><PersimmonMark size={34} /></span>
			<div>
				<div class="title">Update available</div>
				<div class="version">Persimmon v{info.version}</div>
			</div>
		</header>

		<div class="body">
			{#if info.notes}
				<SelfText md={info.notes} />
			{:else}
				<p class="plain">A new version of Persimmon is ready.</p>
			{/if}
			<button class="link" onclick={() => openExternal(info.url)}>
				Release page on GitHub
				<Icon name="open_in_new" size={16} />
			</button>
		</div>

		{#if needsPermission}
			<p class="note">
				Android needs your permission for Persimmon to install its own updates. Turn on "Allow from
				this source", then come back: the update carries on by itself.
			</p>
		{:else if failed}
			<p class="note">The download didn't finish. Check your connection and try again.</p>
		{/if}

		<div class="actions">
			<button class="primary" onclick={primary} disabled={busy}>
				{#if downloading}
					Downloading {percent}%
				{:else if installing}
					Opening the installer…
				{:else if needsPermission}
					Allow installing updates
				{:else if failed}
					Try again
				{:else}
					Update
				{/if}
			</button>
			{#if downloading}
				<div class="progress"><div class="bar" style:width="{percent}%"></div></div>
			{/if}
			<div class="secondary">
				<button class="text" onclick={close} disabled={busy}>Not now</button>
				<button class="text" class:warn={confirmSkip} onclick={skip} disabled={busy}>
					{confirmSkip ? `Tap again to skip v${info.version}` : 'Skip this version'}
				</button>
			</div>
		</div>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 172;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 173;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		padding-bottom: env(safe-area-inset-bottom);
		max-height: 84vh;
		display: flex;
		flex-direction: column;
	}
	.grab {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--md-sys-color-outline-variant);
		margin: 8px auto 4px;
		flex: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 20px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
		flex: none;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 46px;
		height: 46px;
		border-radius: 23px;
		background: #ed5d1f;
		box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12);
		line-height: 0;
		flex: none;
	}
	.title {
		font-size: var(--type-headline);
		font-weight: var(--weight-heading);
		color: var(--md-sys-color-primary);
	}
	.version {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 2px;
	}
	.body {
		overflow-y: auto;
		padding: 12px 20px 4px;
	}
	.plain {
		margin: 0;
		color: var(--md-sys-color-on-surface-variant);
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 10px 0 4px;
		padding: 4px 0;
		color: var(--md-sys-color-primary);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
	}
	.note {
		margin: 4px 20px 0;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--type-secondary);
		line-height: 1.45;
		flex: none;
	}
	.actions {
		padding: 12px 16px 16px;
		flex: none;
	}
	.primary {
		width: 100%;
		padding: 12px;
		border-radius: 12px;
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: inherit;
		font-size: var(--type-body-lg);
		font-weight: var(--weight-title);
		font-variant-numeric: tabular-nums;
	}
	.primary:disabled {
		opacity: 0.85;
	}
	.progress {
		height: 3px;
		margin-top: 8px;
		border-radius: 2px;
		background: var(--md-sys-color-surface-container-highest);
		overflow: hidden;
	}
	.bar {
		height: 100%;
		background: var(--md-sys-color-primary);
		transition: width 200ms linear;
	}
	.secondary {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
	}
	.text {
		padding: 10px 8px;
		color: var(--md-sys-color-on-surface-variant);
		font: inherit;
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
	}
	.text.warn {
		color: var(--md-sys-color-error);
	}
	.text:disabled {
		opacity: 0.5;
	}
</style>
