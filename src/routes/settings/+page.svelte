<script lang="ts">
	import { IS_NATIVE } from '$lib/utils/platform';
	import { Browser } from '@capacitor/browser';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { prefs, type Layout, type ThemeName } from '$lib/stores/prefs';
	import { hidden } from '$lib/stores/hidden';
	import { subscribed } from '$lib/stores/subscribed';
	import { clearCache } from '$lib/reddit/client';

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
	</section>

	<section>
		<h2>Content</h2>
		<label class="row toggle">
			<span>Show NSFW posts</span>
			<input type="checkbox" bind:checked={$prefs.showNsfw} />
		</label>
		<label class="row toggle">
			<span>Blur NSFW media</span>
			<input type="checkbox" bind:checked={$prefs.blurNsfw} />
		</label>
		<label class="row toggle">
			<span>Autoplay videos</span>
			<input type="checkbox" bind:checked={$prefs.autoplayVideos} />
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
		<h2>Storage</h2>
		<button class="action" onclick={() => hidden.clear()}>Clear hidden posts ({$hidden.size})</button>
		<button class="action" onclick={() => subscribed.clear()}>Clear subscribed ({$subscribed.length})</button>
		<button class="action" onclick={() => clearCache()}>Clear in-memory cache</button>
		<button class="action danger" onclick={() => prefs.reset()}>Reset all preferences</button>
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
