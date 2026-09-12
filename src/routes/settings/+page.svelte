<script lang="ts">
	import { blockedUsers } from '$lib/stores/blockedUsers';
	import { IS_NATIVE, IS_IOS } from '$lib/utils/platform';
	import { openExternal } from '$lib/utils/openExternal';
	import { GITHUB_REPO_URL as GITHUB_URL, KOFI_URL } from '$lib/utils/appLinks';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import Switch from '$lib/components/shared/Switch.svelte';
	import { prefs, type Layout, type ThemeName } from '$lib/stores/prefs';
	import { hidden } from '$lib/stores/hidden';
	import { subscribed } from '$lib/stores/subscribed';
	import { saved } from '$lib/stores/saved';
	import { readPosts } from '$lib/stores/readPosts';
	import { subSort } from '$lib/stores/subSort';
	import { feedCache } from '$lib/stores/feedCache';
	import { filters, type FilterKind } from '$lib/stores/filters';
	import { openWhatsNew } from '$lib/stores/whatsNew';
	import { checkForUpdates, updateAvailable } from '$lib/stores/updateCheck';
	import { installState, startUpdate } from '$lib/stores/updateInstall';
	import { get } from 'svelte/store';
	import { clearCache } from '$lib/reddit/client';
	import {
		serializeBackup,
		parseBackup,
		summarize,
		importBackup,
		BACKUP_EXTENSION,
		type Backup,
		type BackupSummary
	} from '$lib/utils/backup';
	import { writeAutoBackup } from '$lib/utils/autoBackup';
	import { pushToast } from '$lib/stores/toast';
	import { undoable, undoableClear } from '$lib/utils/undoable';
	import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
	import { Share } from '@capacitor/share';

	const themes: ThemeName[] = ['dark', 'light', 'amoled', 'cream', 'slate', 'sunset', 'twilight'];
	const layouts: Layout[] = ['card', 'compact', 'gallery'];
	const accents = ['#d0bcff', '#9ccc65', '#ff8a65', '#4dd0e1', '#f48fb1', '#ffd54f'];

	const APP_VERSION = __APP_VERSION__;

	let checkingUpdate = $state(false);
	// A found update also lands in the persistent row below, so the toast here is
	// just immediate feedback on the tap.
	let updateBusy = $derived(
		$installState?.stage === 'downloading' || $installState?.stage === 'installing'
	);
	async function checkUpdates() {
		checkingUpdate = true;
		// replace:true so a re-tap replaces any lingering result toast with this
		// one (same key) rather than being deduped against it.
		pushToast('Checking for updates…', { key: 'update', replace: true, duration: 8000 });
		const r = await checkForUpdates({ force: true });
		pushToast(
			r === 'available'
				? `Persimmon v${get(updateAvailable)?.version ?? ''} is available`
				: r === 'up-to-date'
					? "You're on the latest version"
					: "Couldn't reach GitHub to check",
			{ key: 'update', replace: true, duration: 2500 }
		);
		checkingUpdate = false;
	}

	const filterKinds: Array<{ kind: FilterKind; label: string; placeholder: string }> = [
		{ kind: 'keywords', label: 'Title keywords', placeholder: 'e.g. politics' },
		{ kind: 'subreddits', label: 'Subreddits', placeholder: 'e.g. funny' },
		{ kind: 'domains', label: 'Link domains', placeholder: 'e.g. x.com' }
	];
	let blockInput = $state('');
	function addBlockedUser() {
		if (!blockInput.trim()) return;
		blockedUsers.block(blockInput);
		blockInput = '';
	}
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
		const json = serializeBackup();
		const date = new Date().toISOString().slice(0, 10);
		const filename = `persimmon-backup-${date}${BACKUP_EXTENSION}`;
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

	// Enabling the toggle writes one backup right away so protection is immediate
	// (and the write path is confirmed) instead of waiting to background the app.
	async function onAutoBackupToggle() {
		if (!$prefs.autoBackup) return;
		const ok = await writeAutoBackup();
		pushToast(ok ? 'Backup saved to Documents/Persimmon' : "Couldn't write to Documents");
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

	// ---- Clearing stored data ----
	// Every clear that destroys something the user built offers Undo (see
	// undoable.ts). Caches are the exception: nothing is lost, so they just go.
	const caches: Array<{ label: string; hint: string; count: () => string; clear: () => void }> = [
		{
			label: 'Cached feeds',
			hint: 'Last-known posts shown when Reddit is unreachable',
			count: () => String($feedCache.size),
			clear: () => {
				feedCache.clear();
				pushToast('Cleared cached feeds', { key: 'clear:feedcache', replace: true });
			}
		},
		{
			label: 'Sort memory',
			hint: 'Per-subreddit sort choices',
			count: () => String($subSort.size),
			clear: () => {
				const snapshot = [...$subSort.entries()];
				undoableClear({
					count: snapshot.length,
					singular: 'remembered sort',
					plural: 'remembered sorts',
					perform: () => subSort.clear(),
					undo: () => subSort.hydrate(snapshot, 'replace')
				});
			}
		},
		{
			label: 'In-memory cache',
			hint: 'This session\u2019s fetched pages',
			count: () => '',
			clear: () => {
				clearCache();
				pushToast('Cleared in-memory cache', { key: 'clear:memcache', replace: true });
			}
		}
	];

	function clearSubscribed() {
		const snapshot = [...$subscribed];
		undoableClear({
			count: snapshot.length,
			singular: 'subscribed sub',
			plural: 'subscribed subs',
			perform: () => subscribed.clear(),
			undo: () => subscribed.hydrate(snapshot, 'replace')
		});
	}

	function clearReadHistory() {
		const snapshot = [...$readPosts.entries()];
		undoableClear({
			count: snapshot.length,
			singular: 'read post',
			plural: 'read posts',
			perform: () => readPosts.clear(),
			undo: () => readPosts.hydrate(snapshot, 'replace')
		});
	}

	function resetPreferences() {
		const snapshot = { ...get(prefs) };
		undoable({
			key: 'reset-prefs',
			message: 'Preferences reset to defaults',
			perform: () => prefs.reset(),
			undo: () => prefs.set(snapshot)
		});
	}
</script>

<TopAppBar title="Settings" />

<div class="settings">
	<section>
		<h2>Appearance</h2>

		<div class="row">
			<span class="label"><span class="title">Theme</span></span>
			<Dropdown bind:value={$prefs.theme} options={themes} label="Theme" align="right" />
		</div>

		<div class="row">
			<span class="label"><span class="title">Accent</span></span>
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
			<span class="label">
				<span class="title">Post layout</span>
				<span class="sub">How posts are shown in feeds</span>
			</span>
			<Dropdown bind:value={$prefs.layout} options={layouts} label="Layout" align="right" />
		</div>

		<label class="row">
			<span class="label">
				<span class="title">Text size</span>
				<span class="sub" style:font-size="calc(var(--type-meta) * var(--font-scale))">
					Post titles and comments scale to this size.
				</span>
			</span>
			<span class="slider">
				<input type="range" min="0.8" max="1.5" step="0.1" bind:value={$prefs.fontScale} />
				<span class="value">{Math.round($prefs.fontScale * 100)}%</span>
			</span>
		</label>
	</section>

	<section>
		<h2>Feed</h2>
		{#if !IS_IOS}
			<label class="row">
				<span class="label"><span class="title">Show NSFW posts</span></span>
				<Switch bind:checked={$prefs.showNsfw} />
			</label>
			<label class="row">
				<span class="label">
					<span class="title">Blur NSFW media</span>
					<span class="sub">Tap to reveal instead of showing it outright</span>
				</span>
				<Switch bind:checked={$prefs.blurNsfw} />
			</label>
		{:else}
			<div class="row note"><span>NSFW posts are hidden on iOS.</span></div>
		{/if}
		<label class="row">
			<span class="label"><span class="title">Autoplay videos</span></span>
			<Switch bind:checked={$prefs.autoplayVideos} />
		</label>
		<label class="row">
			<span class="label">
				<span class="title">Grey out opened posts</span>
				<span class="sub">Dim the title of anything you've already read</span>
			</span>
			<Switch bind:checked={$prefs.markPostsRead} />
		</label>
		<label class="row indent" class:disabled={!$prefs.markPostsRead}>
			<span class="label">
				<span class="title">Hide them from feeds</span>
				<span class="sub">Drop opened posts entirely instead of dimming them</span>
			</span>
			<Switch bind:checked={$prefs.hideReadPosts} disabled={!$prefs.markPostsRead} />
		</label>
		<label class="row">
			<span class="label">
				<span class="title">Auto-scrolling feed</span>
				<span class="sub">Scrolls the feed for you, hands-free</span>
			</span>
			<Switch bind:checked={$prefs.lazyMode} />
		</label>
		{#if $prefs.lazyMode}
			<label class="row indent">
				<span class="label"><span class="title">Scroll speed</span></span>
				<span class="slider">
					<input type="range" min="20" max="200" step="10" bind:value={$prefs.lazyModePxPerSec} />
					<span class="value">{$prefs.lazyModePxPerSec}/s</span>
				</span>
			</label>
		{/if}
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
		<div class="filter-group">
			<div class="filter-label">Blocked users</div>
			<div class="filter-hint">
				Unlike the filters above, this applies everywhere: their posts leave every feed and search, and their comments collapse in every thread.
			</div>
			{#if $blockedUsers.size > 0}
				<div class="chips">
					{#each [...$blockedUsers.values()] as u (u.name)}
						<button class="chip" onclick={() => blockedUsers.unblock(u.name)}>
							<span>u/{u.name}</span>
							<Icon name="close" size={14} />
						</button>
					{/each}
				</div>
			{/if}
			<form class="filter-add" onsubmit={(e) => { e.preventDefault(); addBlockedUser(); }}>
				<input type="text" bind:value={blockInput} placeholder="username" />
				<button type="submit" class="add-btn" aria-label="Block user"><Icon name="add" size={20} /></button>
			</form>
		</div>
	</section>

	<section>
		<h2>Behaviour</h2>
		<label class="row">
			<span class="label"><span class="title">Haptic feedback</span></span>
			<Switch bind:checked={$prefs.haptics} />
		</label>
		<label class="row">
			<span class="label">
				<span class="title">Open links in-app</span>
				<span class="sub">Off sends external links to your browser</span>
			</span>
			<Switch bind:checked={$prefs.openLinksInBrowser} />
		</label>
		<label class="row">
			<span class="label">
				<span class="title">Retry when Reddit blocks us</span>
				<span class="sub">Tries alternate identities before giving up on a request</span>
			</span>
			<Switch bind:checked={$prefs.uaEscalationEnabled} />
		</label>
	</section>

	<section>
		<h2>Your data</h2>
		<a class="nav" href="/saved">
			<Icon name="bookmark" size={20} />
			<span class="label"><span class="title">Saved posts</span></span>
			<span class="meta">{$saved.size}</span>
			<Icon name="chevron_right" size={20} />
		</a>
		<a class="nav" href="/hidden">
			<Icon name="visibility_off" size={20} />
			<span class="label"><span class="title">Hidden posts</span></span>
			<span class="meta">{$hidden.size}</span>
			<Icon name="chevron_right" size={20} />
		</a>

		<div class="subhead">Backup</div>
		<div class="row note">
			<span>Save your subs, saved &amp; hidden posts, filters, and settings to a file — then restore them on a new device or after reinstalling.</span>
		</div>
		{#if IS_NATIVE}
			<label class="row">
				<span class="label">
					<span class="title">Auto-backup</span>
					<span class="sub">
						Keeps a current backup in <strong>Documents/Persimmon/</strong> that survives
						uninstalling. Written each time you leave the app.
					</span>
				</span>
				<Switch bind:checked={$prefs.autoBackup} onchange={onAutoBackupToggle} />
			</label>
		{/if}
		<button class="nav" onclick={doExport}>
			<Icon name="download" size={20} />
			<span class="label"><span class="title">Export backup</span></span>
		</button>
		<button class="nav" onclick={() => fileInput?.click()}>
			<Icon name="upload" size={20} />
			<span class="label"><span class="title">Import backup</span></span>
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="*/*"
			onchange={onImportFile}
			hidden
		/>
		{#if pendingSummary}
			<div class="import-panel">
				<div class="import-title">Restore this backup?</div>
				<div class="import-meta">
					{pendingSummary.subscribed} subs · {pendingSummary.saved} saved · {pendingSummary.hidden} hidden
					· {pendingSummary.filters} filters · {pendingSummary.blockedUsers} blocked · {pendingSummary.readPosts} read
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

		<div class="subhead">Clear</div>
		<button
			class="nav"
			onclick={clearSubscribed}
		>
			<span class="label">
				<span class="title">Subscribed subs</span>
				<span class="sub">Your bookmarked subreddits</span>
			</span>
			<span class="meta">{$subscribed.length}</span>
		</button>
		<button
			class="nav"
			onclick={clearReadHistory}
		>
			<span class="label">
				<span class="title">Read history</span>
				<span class="sub">Which posts count as opened</span>
			</span>
			<span class="meta">{$readPosts.size}</span>
		</button>
		{#each caches as c (c.label)}
			<button class="nav" onclick={c.clear}>
				<span class="label">
					<span class="title">{c.label}</span>
					<span class="sub">{c.hint}</span>
				</span>
				<span class="meta">{c.count()}</span>
			</button>
		{/each}
		<button class="nav danger" onclick={resetPreferences}>
			<Icon name="warning" size={20} />
			<span class="label">
				<span class="title">Reset all preferences</span>
				<span class="sub">Settings only — subs, saved posts, filters and blocks are kept</span>
			</span>
		</button>
	</section>

	<section>
		<h2>About</h2>
		<div class="about-row">
			<div class="brand">
				<div class="brand-name">Persimmon</div>
				<div class="brand-sub">Read-only Reddit client · v{APP_VERSION}</div>
			</div>
		</div>
		{#if $updateAvailable}
			<!-- A found update stays on screen as its own row rather than only
			     flashing past in a toast, so it's still actionable later. -->
			<button class="nav update-row" onclick={() => startUpdate()} disabled={updateBusy}>
				<Icon name="system_update" size={20} filled />
				<span class="label">
					<span class="title">
						{updateBusy ? `Downloading v${$updateAvailable.version}…` : `Update to v${$updateAvailable.version}`}
					</span>
					<span class="sub">
						{$installState?.stage === 'installing'
							? 'Opening the installer…'
							: 'Downloads and installs from GitHub'}
					</span>
				</span>
				<span class="meta">
					{$installState?.stage === 'downloading'
						? `${$installState.percent}%`
						: $installState?.stage === 'installing'
							? 'Opening…'
							: 'Install'}
				</span>
			</button>
		{/if}
		<button class="nav" onclick={checkUpdates} disabled={checkingUpdate || updateBusy}>
			<Icon name="system_update" size={20} />
			<span class="label"><span class="title">{checkingUpdate ? 'Checking…' : 'Check for updates'}</span></span>
			<span class="meta">v{APP_VERSION}</span>
		</button>
		<button class="nav" onclick={openWhatsNew}>
			<Icon name="auto_awesome" size={20} />
			<span class="label"><span class="title">What's new</span></span>
		</button>
		<button class="nav" onclick={() => openExternal(KOFI_URL)}>
			<Icon name="favorite" size={20} filled />
			<span class="label"><span class="title">Support my work on Ko-fi</span></span>
			<span class="meta">@boundingbears</span>
		</button>
		<button class="nav" onclick={() => openExternal(GITHUB_URL)}>
			<Icon name="code" size={20} />
			<span class="label"><span class="title">View source on GitHub</span></span>
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
	/* Each section is one M3 surface card, so the page reads as a handful of
	   groups rather than an undifferentiated wall of rows. */
	section {
		margin: 0 12px 12px;
		padding: 4px 0 8px;
		border-radius: 16px;
		background: var(--md-sys-color-surface-container-low);
		overflow: hidden;
	}
	h2 {
		margin: 0;
		padding: 14px 16px 8px;
		font-size: var(--type-meta);
		font-weight: var(--weight-heading);
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--md-sys-color-primary);
	}
	/* Divides a section into labelled runs (Backup / Clear) without spending a
	   whole card on each. */
	.subhead {
		margin-top: 4px;
		padding: 14px 16px 6px;
		border-top: 1px solid var(--md-sys-color-outline-variant);
		font-size: var(--type-meta);
		font-weight: var(--weight-heading);
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--md-sys-color-on-surface-variant);
	}

	/* ---- Row anatomy ----
	   Every row is: [optional icon] [label + sub] [trailing control/meta].
	   `.row` carries a control, `.nav` is tappable and goes somewhere or does
	   something. Both share the label block so text lines up down the page. */
	.row,
	.nav {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 12px 16px;
		font-size: var(--type-body);
		text-align: left;
		color: var(--md-sys-color-on-surface);
		background: none;
		font: inherit;
		font-size: var(--type-body);
	}
	label.row {
		cursor: pointer;
	}
	.nav:active {
		background: var(--md-sys-color-surface-container);
	}
	.nav:disabled {
		opacity: 0.6;
	}
	.label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.title {
		font-weight: var(--weight-title);
		line-height: 1.3;
	}
	.sub {
		font-size: var(--type-meta);
		line-height: 1.4;
		color: var(--md-sys-color-on-surface-variant);
		font-weight: 400;
	}
	.meta {
		flex: none;
		font-size: var(--type-secondary);
		color: var(--md-sys-color-on-surface-variant);
		font-variant-numeric: tabular-nums;
	}
	/* A setting that only applies while its parent is on. */
	.row.indent {
		padding-left: 32px;
	}
	.row.indent .title {
		font-weight: 400;
	}
	.row.disabled {
		opacity: 0.5;
	}
	.row.note {
		padding-top: 4px;
		font-size: var(--type-secondary);
		line-height: 1.5;
		color: var(--md-sys-color-on-surface-variant);
	}
	.nav.danger,
	.nav.danger :global(.material-symbols-rounded) {
		color: var(--md-sys-color-error);
	}
	/* A waiting update is the one row in Settings worth pulling the eye. */
	.nav.update-row,
	.nav.update-row .meta,
	.nav.update-row :global(.material-symbols-rounded) {
		color: var(--md-sys-color-primary);
	}
	.nav.update-row .meta {
		font-weight: var(--weight-heading);
	}
	.nav :global(.material-symbols-rounded) {
		flex: none;
		color: var(--md-sys-color-on-surface-variant);
	}

	input[type='color'],
	input[type='range'] {
		font: inherit;
	}
	.slider {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
		width: 150px;
	}
	.slider input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--md-sys-color-primary);
	}
	.accents {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
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
		min-width: 38px;
		text-align: right;
		font-size: var(--type-secondary);
		color: var(--md-sys-color-on-surface-variant);
		font-variant-numeric: tabular-nums;
	}
	.filter-group {
		padding: 8px 16px 12px;
	}
	.filter-hint {
		margin: -4px 0 10px;
		font-size: var(--type-meta);
		line-height: 1.4;
		color: var(--md-sys-color-on-surface-variant);
	}
	.filter-label {
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
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
		font-size: var(--type-secondary);
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
		font-size: var(--type-body);
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
		font-size: var(--type-body);
		font-weight: var(--weight-heading);
		margin-bottom: 6px;
	}
	.import-meta {
		font-size: var(--type-meta);
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
		font-size: var(--type-secondary);
		font-weight: var(--weight-title);
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
		font-size: var(--type-caption);
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
		font-size: var(--type-title);
		font-weight: var(--weight-heading);
		color: var(--md-sys-color-primary);
	}
	.brand-sub {
		font-size: var(--type-meta);
		color: var(--md-sys-color-on-surface-variant);
	}
	.legal {
		padding: 12px 16px 16px;
		font-size: var(--type-caption);
		color: var(--md-sys-color-on-surface-variant);
		line-height: 1.5;
	}
</style>
