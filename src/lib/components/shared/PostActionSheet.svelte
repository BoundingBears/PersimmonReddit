<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import { postActionsState, closePostActions } from '$lib/stores/postActions';
	import { hidden } from '$lib/stores/hidden';
	import { sharePost, copyLink } from '$lib/utils/share';
	import { saveImage } from '$lib/utils/saveImage';
	import { pushToast } from '$lib/stores/toast';
	import { tick as haptic } from '$lib/utils/haptics';
	import { hiddenMetaFromPost } from '$lib/utils/hiddenMeta';

	let post = $derived($postActionsState?.post);
	let hasMedia = $derived(!!(post && (post.image || post.preview)));

	// Suppress scrim taps briefly after the sheet opens. Without this, the
	// synthetic click that follows pointerup at the end of a long-press
	// often lands on the just-mounted scrim and immediately closes the sheet.
	let scrimEnabled = $state(false);
	$effect(() => {
		if ($postActionsState) {
			scrimEnabled = false;
			const t = setTimeout(() => (scrimEnabled = true), 400);
			return () => clearTimeout(t);
		}
	});

	function onScrimClick() {
		if (!scrimEnabled) return;
		closePostActions();
	}

	function permalink(): string {
		return post ? `https://www.reddit.com${post.permalink}` : '';
	}

	function handleHide() {
		if (!post) return;
		const id = post.id;
		const wasHidden = $hidden.has(id);
		const meta = hiddenMetaFromPost(post);
		closePostActions();
		if (wasHidden) {
			hidden.unhide(id);
			pushToast('Post is unhidden');
		} else {
			hidden.hide(id, meta);
			pushToast('Post is hidden', {
				duration: 5000,
				action: { label: 'UNDO', onClick: () => hidden.unhide(id) }
			});
		}
	}

	function handleShare() {
		if (!post) return;
		const url = permalink();
		const title = post.title;
		closePostActions();
		sharePost({ url, title });
	}

	function handleCopy() {
		if (!post) return;
		const url = permalink();
		closePostActions();
		copyLink(url);
	}

	async function handleSave() {
		if (!post) return;
		const url = post.image?.url ?? post.preview?.url;
		if (!url) return;
		closePostActions();
		pushToast('Saving image…', { key: 'save-image', duration: 10_000 });
		const res = await saveImage(url);
		pushToast(res.ok ? 'Image saved' : 'Save failed', {
			key: 'save-image',
			replace: true,
			duration: 2500
		});
		if (res.ok) haptic();
	}

	function handleAuthor() {
		if (!post) return;
		const author = post.author;
		closePostActions();
		goto(`/u/${author}`);
	}

	function handleSub() {
		if (!post) return;
		const sub = post.subreddit;
		closePostActions();
		goto(`/r/${sub}`);
	}

	function slideUp(_node: HTMLElement, { duration = 220 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (_t: number, u: number) => `transform: translateY(${100 * u}%);`
		};
	}
</script>

{#if post}
	<div
		class="scrim"
		onclick={onScrimClick}
		role="presentation"
		transition:fade={{ duration: 150 }}
	></div>
	<aside class="sheet" aria-label="Post actions" transition:slideUp={{ duration: 220 }}>
		<div class="grab"></div>
		<div class="header">
			<div class="title">{post.title}</div>
			<div class="meta">r/{post.subreddit} · u/{post.author}</div>
		</div>
		<ul class="actions" role="menu">
			<li role="menuitem">
				<button class="action" onclick={handleHide}>
					<Icon name={$hidden.has(post.id) ? 'visibility' : 'visibility_off'} size={22} />
					<span>{$hidden.has(post.id) ? 'Unhide' : 'Hide'}</span>
				</button>
			</li>
			<li role="menuitem">
				<button class="action" onclick={handleShare}>
					<Icon name="share" size={22} />
					<span>Share</span>
				</button>
			</li>
			<li role="menuitem">
				<button class="action" onclick={handleCopy}>
					<Icon name="link" size={22} />
					<span>Copy link</span>
				</button>
			</li>
			{#if hasMedia}
				<li role="menuitem">
					<button class="action" onclick={handleSave}>
						<Icon name="download" size={22} />
						<span>Save image</span>
					</button>
				</li>
			{/if}
			<li role="menuitem">
				<button class="action" onclick={handleAuthor}>
					<Icon name="person" size={22} />
					<span>Open u/{post.author}</span>
				</button>
			</li>
			<li role="menuitem">
				<button class="action" onclick={handleSub}>
					<Icon name="forum" size={22} />
					<span>Open r/{post.subreddit}</span>
				</button>
			</li>
		</ul>
	</aside>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 160;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 161;
		background: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		padding-bottom: env(safe-area-inset-bottom);
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
	}
	.grab {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--md-sys-color-outline-variant);
		margin: 8px auto 4px;
	}
	.header {
		padding: 8px 20px 12px;
		border-bottom: 1px solid var(--md-sys-color-outline-variant);
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		margin-top: 4px;
	}
	.actions {
		list-style: none;
		margin: 0;
		padding: 4px 0 8px;
	}
	.action {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 14px 20px;
		text-align: left;
		font: inherit;
		font-size: 15px;
		color: inherit;
		background: transparent;
		border: 0;
	}
	.action:active {
		background: var(--md-sys-color-surface-container-high);
	}
</style>
