<script lang="ts">
	import { IS_NATIVE, IS_IOS } from '$lib/utils/platform';
	import { Browser } from '@capacitor/browser';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { prefs, type Layout, type ThemeName } from '$lib/stores/prefs';
	import { hidden } from '$lib/stores/hidden';
	import { subscribed } from '$lib/stores/subscribed';
	import { saved } from '$lib/stores/saved';
	import { readPosts } from '$lib/stores/readPosts';
	import { subSort } from '$lib/stores/subSort';
	import { feedCache } from '$lib/stores/feedCache';
	import { filters, type FilterKind } from '$lib/stores/filters';
	import { openWhatsNew } from '$lib/stores/whatsNew';
	import { clearCache } from '$lib/reddit/client';
	import {
		exportBackup,
		parseBackup,
		summarize,
		importBackup,
		type Backup,
		type BackupSummary
	} from '$lib/utils/backup';
	import { pushToast } from '$lib/stores/toast';
	import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
	import { Share } from '@capacitor/share';

	const themes: ThemeName[] = ['dark', 'light', 'amoled', 'cream', 'slate', 'sunset', 'twilight'];
	const layouts: Layout[] = ['card', 'compact', 'gallery'];
	const accents = ['#d0bcff', '#9ccc65', '#ff8a65', '#4dd0e1', '#f48fb1', '#ffd54f'];

	const APP_VERSION = __APP_VERSION__;
	const KOFI_URL = 'https://ko-fi.com/boundingbears';
	const GITHUB_URL = 'https://github.com/BoundingBears/PersimmonReddit';

	async function openExternal(url: string) {
		try {
			if (IS_NATIVE) {
				await Browser.open({ url });
			} else {
				window.open(url, '_blank', 'noopener,noreferrer');
			}
		} catch {
			// ignore — browser not available
		}
	}

	const filterKinds: Array<{ kind: FilterKind; label: string; placeholder: string }> = [
		{ kind: 'keywords', label: 'Title keywords', placeholder: 'e.g. politics' },
		{ kind: 'subreddits', label: 'Subreddits', placeholder: 'e.g. funny' },
		{ kind: 'domains', label: 'Link domains', placeholder: 'e.g. x.com' }
	];
	let filterInputs = $state<Record<FilterKind, string>>({ keywords: '', subreddits: '', domains: '' });
	function addFilter(kind: FilterKind) {
		if (!filterInputs[kind].trim()) return;
		filters.add(kind, filterInputs[kind]);
		filterInputs[kind] = '';
	}

	// ---- Backup export / import ----
	let fileInput: HTMLInputElement | undefined = $state();
	let pendingBackup = $state<Backup | null>(null);
	let pendingSummary = $state<BackupSummary | null>(null);

	async function doExport() {
		const json = JSON.stringify(exportBackup(), null, 2);
		const date = new Date().toISOString().slice(0, 10);
		const filename = `persimmon-backup-${date}.json`;
		try {
			if (IS_NATIVE) {
				const path = `Persimmon/${filename}`;
				await Filesystem.writeFile({
					path,
					data: json,
					directory: Directory.Cache,
					encoding: Encoding.UTF8,
					recursive: true
				});
				const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
				await Share.share({ title: 'Persimmon backup', url: uri });
			} else {
				const blob = new Blob([json], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (e) {
			console.error('export failed', e);
			pushToast('Export failed');
		}
	}

	async function onImportFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const parsed = parseBackup(JSON.parse(await file.text()));
			if (!parsed) {
				pushToast('Not a valid Persimmon backup');
				return;
			}
			pendingBackup = parsed;
			pendingSummary = summarize(parsed);
		} catch {
			pushToast("Couldn't read that file");
		} finally {
			input.value = ''; // let the user re-pick the same file later
		}
	}

	function applyImport(mode: 'merge' | 'replace') {
		if (!pendingBackup) return;
		importBackup(pendingBackup, mode);
		const n = pendingSummary;
		pendingBackup = null;
		pendingSummary = null;
		pushToast(
			mode === 'replace' ? 'Backup restored' : `Merged ${n ? n.subscribed + n.saved : ''} items`
		);
	}

	function cancelImport() {
		pendingBackup = null;
		pendingSummary = null;
	}

</script>

<TopAppBar title="Settings" />

<div class="settings">
	<section>
		<h2>Appearance</h2>

		<div class="row">
			<span>Theme</span>
			<Dropdown bind:value={$prefs.theme} options={themes} label="Theme" align="right" />
		</div>

		<div class="row">
			<span>Accent</span>
			<div class="accents">
				{#each accents as c}
					<button
						class="swatch"
						class:active={$prefs.accent === c}
						style:background={c}
						onclick={() => ($prefs.accent = c)}
						aria-label="Accent {c}"
					></button>
				{/each}
				<input type="color" bind:value={$prefs.accent} aria-label="Custom accent" />
			</div>
		</div>

		<div class="row">
			<span>Default post layout</span>
			<Dropdown bind:value={$prefs.layout} options={layouts} label="Layout" align="right" />
		</div>

		<label class="row">
			<span>Text size</span>
			<input type="range" min="0.8" max="1.5" step="0.1" bind:value={$prefs.fontScale} />
			<span class="value">{Math.round($prefs.fontScale * 100)}%</span>
		</label>
		<div class="row note" style:font-size="calc(14px * var(--font-scale))">
			<span>Preview: post titles and comments scale to this size.</span>
		</div>
	</section>

	<section>
		<h2>Content</h2>
		{#if !IS_IOS}
			<label class="row toggle">
				<span>Show NSFW posts</span>
				<input type="checkbox" bind:checked={$prefs.showNsfw} />
			</label>
			<label class="row toggle">
				<span>Blur NSFW media</span>
				<input type="checkbox" bind:checked={$prefs.blurNsfw} />
			</label>
		{:else}
			<div class="row note">
				<span>NSFW posts are hidden on iOS</span>
			</div>
		{/if}
		<label class="row toggle">
			<span>Autoplay videos</span>
			<input type="checkbox" bind:checked={$prefs.autoplayVideos} />
		</label>
		<label class="row toggle">
			<span>Grey out posts you've opened</span>
			<input type="checkbox" bind:checked={$prefs.markPostsRead} />
		</label>
		<label class="row toggle" class:disabled={!$prefs.markPostsRead}>
			<span>Hide opened posts from feeds</span>
			<input type="checkbox" bind:checked={$prefs.hideReadPosts} disabled={!$prefs.markPostsRead} />
		</label>
	</section>

	<section>
		<h2>Feedback</h2>
		<label class="row toggle">
			<span>Haptic feedback</span>
			<input type="checkbox" bind:checked={$prefs.haptics} />
		</label>
	</section>

	<section>
		<h2>Lazy mode</h2>
		<label class="row toggle">
			<span>Enable auto-scrolling feed</span>
			<input type="checkbox" bind:checked={$prefs.lazyMode} />
		</label>
		<label class="row">
			<span>Speed (px/sec)</span>
			<input type="range" min="20" max="200" step="10" bind:value={$prefs.lazyModePxPerSec} />
			<span class="value">{$prefs.lazyModePxPerSec}</span>
		</label>
	</section>

	<section>
		<h2>Links</h2>
		<label class="row toggle">
			<span>Open external links in in-app browser</span>
			<input type="checkbox" bind:checked={$prefs.openLinksInBrowser} />
		</label>
	</section>

	<section>
		<h2>Filters</h2>
		<div class="row note">
			<span>Hide posts from your subscribed feed by keyword, subreddit, or link domain.</span>
		</div>
		{#each filterKinds as fk (fk.kind)}
			<div class="filter-group">
				<div class="filter-label">{fk.label}</div>
				{#if $filters[fk.kind].length > 0}
					<div class="chips">
						{#each $filters[fk.kind] as value (value)}
							<button class="chip" onclick={() => filters.remove(fk.kind, value)}>
								<span>{value}</span>
								<Icon name="close" size={14} />
							</button>
						{/each}
					</div>
				{/if}
				<form class="filter-add" onsubmit={(e) => { e.preventDefault(); addFilter(fk.kind); }}>
					<input type="text" bind:value={filterInputs[fk.kind]} placeholder={fk.placeholder} />
					<button type="submit" class="add-btn" aria-label="Add filter"><Icon name="add" size={20} /></button>
				</form>
			</div>
		{/each}
	</section>

	<section>
		<h2>Storage</h2>
		<a class="action" href="/saved">
			<Icon name="bookmark" size={18} />
			<span>Saved posts</span>
			<span class="action-meta">{$saved.size}</span>
		</a>
		<a class="action" href="/hidden">
			<Icon name="visibility_off" size={18} />
			<span>Hidden posts</span>
			<span class="action-meta">{$hidden.size}</span>
		</a>
		<button class="action" onclick={() => subscribed.clear()}>Clear subscribed ({$subscribed.length})</button>
		<button class="action" onclick={() => readPosts.clear()}>Clear read history ({$readPosts.size})</button>
		<button class="action" onclick={() => subSort.clear()}>Clear sort memory ({$subSort.size})</button>
		<button class="action" onclick={() => feedCache.clear()}>Clear cached feeds ({$feedCache.size})</button>
		<button class="action" onclick={() => clearCache()}>Clear in-memory cache</button>
		<button class="action danger" onclick={() => prefs.reset()}>Reset all preferences</button>
	</section>

	<section>
		<h2>Backup</h2>
		<div class="row note">
			<span>Save your subs, saved &amp; hidden posts, filters, and settings to a file — then restore them on a new device or after reinstalling.</span>
		</div>
		<button class="action" onclick={doExport}>
			<Icon name="download" size={18} />
			<span>Export backup</span>
		</button>
		<button class="action" onclick={() => fileInput?.click()}>
			<Icon name="upload" size={18} />
			<span>Import backup</span>
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			onchange={onImportFile}
			hidden
		/>
		{#if pendingSummary}
			<div class="import-panel">
				<div class="import-title">Restore this backup?</div>
				<div class="import-meta">
					{pendingSummary.subscribed} subs · {pendingSummary.saved} saved · {pendingSummary.hidden} hidden
					· {pendingSummary.filters} filters · {pendingSummary.readPosts} read
				</div>
				<div class="import-meta dim">
					Exported {new Date(pendingSummary.exportedAt).toLocaleDateString()} · v{pendingSummary.appVersion}
				</div>
				<div class="import-actions">
					<button class="imp merge" onclick={() => applyImport('merge')}>Merge</button>
					<button class="imp replace" onclick={() => applyImport('replace')}>Replace all</button>
					<button class="imp cancel" onclick={cancelImport}>Cancel</button>
				</div>
				<div class="import-hint">
					<strong>Merge</strong> adds to what you have. <strong>Replace</strong> overwrites everything, including settings.
				</div>
			</div>
		{/if}
	</section>

	<section>
		<h2>Connection</h2>
		<label class="row toggle">
			<span>Try alternate identities when Reddit blocks us</span>
			<input type="checkbox" bind:checked={$prefs.uaEscalationEnabled} />
		</label>
	</section>

	<section>
		<h2>About</h2>
		<div class="about-row">
			<div class="brand">
				<div class="brand-name">Persimmon</div>
				<div class="brand-sub">Read-only Reddit client · v{APP_VERSION}</div>
			</div>
		</div>
		<button class="action" onclick={() => openExternal(KOFI_URL)}>
			<Icon name="favorite" size={18} filled />
			<span>Support my work on Ko-fi</span>
			<span class="action-meta">@boundingbears</span>
		</button>
		<button class="action" onclick={openWhatsNew}>
			<Icon name="auto_awesome" size={18} />
			<span>What's new</span>
		</button>
		<button class="action" onclick={() => openExternal(GITHUB_URL)}>
			<Icon name="code" size={18} />
			<span>View source on GitHub</span>
		</button>
		<div class="legal">
			Built with SvelteKit + Capacitor · MIT License
			<br />
			Not affiliated with Reddit, Inc. Uses public JSON feeds; no account required.
		</div>
	</section>
</div>

<style>
	.settings {
		padding: 8px 0 24px;
	}
	section {
		margin-bottom: 16px;
		padding: 4px 0;
		background: var(--md-sys-color-surface-container-low);
	}
	h2 {
		margin: 0;
		padding: 12px 16px 6px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		font-size: 14px;
	}
	.row.toggle {
		cursor: pointer;
	}
	.row.toggle.disabled {
		opacity: 0.5;
	}
	.row.note {
		color: var(--md-sys-color-on-surface-variant);
		font-style: italic;
		font-size: 13px;
	}
	input[type='color'],
	input[type='range'] {
		font: inherit;
	}
	.accents {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 14px;
		border: 2px solid transparent;
	}
	.swatch.active {
		border-color: var(--md-sys-color-on-surface);
	}
	input[type='color'] {
		width: 32px;
		height: 32px;
		border: 0;
		background: none;
		padding: 0;
	}
	.value {
		min-width: 36px;
		text-align: right;
		color: var(--md-sys-color-on-surface-variant);
	}
	.action {
		display: flex;
		align-items: center;
		gap: 8px;
		width: calc(100% - 32px);
		margin: 6px 16px;
		padding: 10px 12px;
		text-align: left;
		background: var(--md-sys-color-surface-container);
		border-radius: 8px;
		color: var(--md-sys-color-on-surface);
		font: inherit;
		font-weight: 500;
	}
	.action:active {
		background: var(--md-sys-color-surface-container-high);
	}
	.action.danger {
		color: var(--md-sys-color-error);
	}
	.action:disabled {
		opacity: 0.6;
	}
	.filter-group {
		padding: 8px 16px 12px;
	}
	.filter-label {
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 8px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px 4px 12px;
		border-radius: 16px;
		font: inherit;
		font-size: 13px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface);
	}
	.chip:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.filter-add {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.filter-add input {
		flex: 1;
		min-width: 0;
		padding: 8px 12px;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: 8px;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		font: inherit;
		font-size: 14px;
	}
	.add-btn {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 8px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}
	.add-btn:active {
		background: var(--md-sys-color-surface-container-highest);
	}
	.import-panel {
		margin: 6px 16px;
		padding: 14px;
		border-radius: 12px;
		background: var(--md-sys-color-surface-container-high);
	}
	.import-title {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 6px;
	}
	.import-meta {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		line-height: 1.5;
	}
	.import-meta.dim {
		opacity: 0.7;
		margin-bottom: 12px;
	}
	.import-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.imp {
		padding: 8px 14px;
		border-radius: 8px;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
	}
	.imp.merge {
		background: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}
	.imp.replace {
		background: var(--md-sys-color-error);
		color: var(--md-sys-color-on-error);
	}
	.imp.cancel {
		background: var(--md-sys-color-surface-container-highest);
		color: var(--md-sys-color-on-surface);
	}
	.import-hint {
		margin-top: 10px;
		font-size: 11px;
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
	}
	.about-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px 4px;
	}
	.brand-name {
		font-size: 16px;
		font-weight: 600;
		color: var(--md-sys-color-primary);
	}
	.brand-sub {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
	}
	.action :global(.material-symbols-rounded) {
		margin-right: 4px;
		flex: none;
	}
	.action-meta {
		margin-left: auto;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		font-weight: 400;
	}
	.legal {
		padding: 12px 16px 16px;
		font-size: 11px;
		color: var(--md-sys-color-on-surface-variant);
		line-height: 1.5;
	}
</style>
