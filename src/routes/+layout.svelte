<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { afterNavigate, beforeNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { App } from '@capacitor/app';
	import { IS_NATIVE } from '$lib/utils/platform';
	import { initTheme } from '$lib/stores/theme';
	import { startLazyScroll } from '$lib/utils/lazyScroll';
	import { installDeepLinks } from '$lib/utils/installDeepLinks';
	import { installBackHandler } from '$lib/utils/installBackHandler';
	import { warmupReddit } from '$lib/reddit/client';
	import { SplashScreen } from '@capacitor/splash-screen';
	import { edgeSwipeBack, consumeEdgeSwipeBackCleanup } from '$lib/actions/edgeSwipeBack';
	import { pushPageSnapshot, popPageSnapshot } from '$lib/utils/pageSnapshot';
	import { prefs } from '$lib/stores/prefs';
	import BottomNav from '$lib/components/chrome/BottomNav.svelte';
	import NavDrawer from '$lib/components/chrome/NavDrawer.svelte';
	import ImageViewer from '$lib/components/shared/ImageViewer.svelte';
	import PostPage from '$lib/components/post/PostPage.svelte';
	import BootIntro from '$lib/components/shared/BootIntro.svelte';
	import LockScreen from '$lib/components/shared/LockScreen.svelte';
	import {
		appLocked,
		confirmApp,
		confirmPrivate,
		installLock,
		lockAvailable,
		openApp,
		privateTabOpen,
		privateUnlocked,
		privateViewOpen,
		setScrollIndicator,
		setSecure
	} from '$lib/stores/lock';
	import { isPrivate, privatePosts } from '$lib/stores/privatePosts';
	import { introPlaying, mirrorIntroPref, shouldPlayIntro } from '$lib/utils/bootIntro';
	import { noteNavigation, seedFor } from '$lib/stores/postLayer';
	import { stopInlineVideo } from '$lib/stores/inlineVideo';
	import { setActiveScroller } from '$lib/utils/scroller';
	import PostActionSheet from '$lib/components/shared/PostActionSheet.svelte';
	import WhatsNew from '$lib/components/shared/WhatsNew.svelte';
	import UpdateSheet from '$lib/components/shared/UpdateSheet.svelte';
	import { resumeAfterPermission } from '$lib/stores/updateInstall';
	import SubredditInfoSheet from '$lib/components/shared/SubredditInfoSheet.svelte';
	import FeedEditSheet from '$lib/components/shared/FeedEditSheet.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import { openWhatsNewIfUpdated } from '$lib/stores/whatsNew';
	import { checkForUpdates } from '$lib/stores/updateCheck';
	import { startAutoBackup } from '$lib/utils/autoBackup';
	import { getLinkHandling, openLinkHandlingSettings } from '$lib/utils/linkHandling';
	import { pushToast } from '$lib/stores/toast';
	import {
		cancelRestore,
		installSessionPersistence,
		isReplaying,
		setPrivateUrlCheck,
		setReplaying,
		takeRestoredStack,
		trackNavigation
	} from '$lib/stores/session';

	let { children } = $props();

	// A post opened from a list is shown in a layer over it (postLayer.ts).
	// The list stays mounted underneath and keeps the window's scroll, so the
	// layer scrolls on its own and Back only has to take it away.
	let layerId = $derived($page.state.postId);
	let layerEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		setActiveScroller(layerId && layerEl ? layerEl : null);
		return () => setActiveScroller(null);
	});
	// Opening or closing the layer moves through history without a
	// navigation, so afterNavigate never hears of it. Keep the mirrored back
	// stack (session.ts) right by hand: a kill with a post open must come back
	// to that post, and Back at the list must not think a post is still open.
	let layerSeen = false;
	$effect(() => {
		const id = layerId;
		if (!id && !layerSeen) return;
		layerSeen = !!id;
		trackNavigation(id ? `/comments/${id}` : $page.url.pathname + $page.url.search, 'popstate');
	});
	// The private folder (lock.ts, privatePosts.ts). Two things the layout owns:
	// a restart must never walk back into a private post by itself, and private
	// content on screen is kept out of screenshots and the recents thumbnail.
	// Only private content: the rest of the app stays capturable on purpose.
	const privatePostIn = (url: string) => {
		const id = url.match(/^\/comments\/([a-z0-9]+)/i)?.[1];
		return !!id && isPrivate(id);
	};
	setPrivateUrlCheck(privatePostIn);
	// A post opened out of the private folder: the layer is over the Saved
	// page's Private tab. (The same post tapped in an ordinary feed is just a
	// post; what is private is that it is in the folder.)
	let privatePostOpen = $derived(!!layerId && $privateTabOpen && $privatePosts.has(layerId));
	let privateOnScreen = $derived($privateViewOpen || privatePostOpen);
	$effect(() => {
		setSecure(privateOnScreen);
	});
	// The folder has locked again (the app was left) with one of its posts
	// still open. Locking only the list would leave that post readable.
	let privatePostLocked = $derived(
		privatePostOpen && IS_NATIVE && $lockAvailable !== false && $prefs.lockScope === 'private' && !$privateUnlocked
	);

	// Same motion as a page change (see the view-transition rules in app.css).
	function layerIn(_node: HTMLElement) {
		return { duration: 220, easing: cubicOut, css: (_t: number, u: number) => `transform: translateX(${u * 100}%)` };
	}
	function layerOut(_node: HTMLElement) {
		return { duration: 170, easing: cubicIn, css: (_t: number, u: number) => `transform: translateX(${u * 100}%)` };
	}

	// Smooth page transitions via the View Transitions API. We tag the document
	// with the navigation direction (forward / back) so CSS can pick the right
	// slide animation. Falls back to instant navigation in older WebViews.
	//
	// Concurrent-transition guard: rapid bottom-nav tapping (Sub → Home → Sub)
	// will fire a new navigation while a previous transition is still animating.
	// Without this guard, snapshots stack on each other and the back gesture
	// starts targeting the wrong history entry. Calling skipTransition() on the
	// in-flight one before starting a new one keeps everything coherent.
	let activeTransition: { skipTransition: () => void; finished: Promise<void> } | null = null;
	// The pages the bottom bar switches between (BottomNav.svelte).
	const TAB_ROOTS = new Set(['/', '/subreddits', '/search', '/saved']);

	// Maintain a stack of HTML snapshots of pages we've visited, so the iOS
	// edge-swipe-back gesture can render a real preview of the previous page
	// underneath the current one. Forward nav pushes the leaving page;
	// popstate-back pops it (so the next back-swipe peek is the page further
	// back in history, not the one we just popped). See pageSnapshot.ts.
	beforeNavigate((nav) => {
		stopInlineVideo();
		if (nav.type === 'popstate' && (nav.delta ?? 0) < 0) {
			popPageSnapshot();
		} else {
			pushPageSnapshot();
		}
	});

	// The edge-swipe-back gesture defers some DOM cleanup until after the
	// route is mounted, to avoid a flicker between "snapshot peek" and
	// "real new page". This drains that cleanup at the right moment.
	let tabSwitch = false;
	let mainEl: HTMLElement | undefined = $state();
	afterNavigate((nav) => {
		if (tabSwitch) {
			tabSwitch = false;
			mainEl?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
		}
		consumeEdgeSwipeBackCleanup();
		noteNavigation();
		// Mirror the back stack so it can be rebuilt after the app is killed.
		// Arriving back on a list that had a post open over it restores that
		// layer too, and the entry is the post's, not the list's.
		if (nav.to) {
			const layer = $page.state.postId;
			trackNavigation(layer ? `/comments/${layer}` : nav.to.url.pathname + nav.to.url.search, nav.type);
		}
	});

	// Put the user back where they were when the app was killed in the
	// background: session.ts hands over the back stack from that visit and we
	// walk it again. Feed pages along the way rebuild from their restored
	// snapshots without fetching, so this is a few frames, during which the
	// app is hidden so intermediate pages do not flash past.
	const restoredStack = takeRestoredStack();
	if (restoredStack && restoredStack.length > 1 && typeof document !== 'undefined') {
		document.documentElement.dataset.restoring = 'true';
	}
	// Decided now, synchronously, so it is part of the very first frame.
	const playIntro = shouldPlayIntro(!!restoredStack);
	introPlaying.set(playIntro);
	// While the launch animation or the lock screen covers the app, the page
	// underneath is still loading and growing, and Android draws the page's
	// scroll bar on top of everything, cover included: a grey bar down the
	// right edge of the animation. That bar belongs to the Android view, not
	// to the page (styling it away from CSS did nothing on a real phone), so
	// it starts switched off in MainActivity and is switched on here once
	// nothing is covering the app.
	$effect(() => {
		setScrollIndicator(!($introPlaying || $appLocked));
	});
	async function replaySession(stack: string[]) {
		const reveal = () => delete document.documentElement.dataset.restoring;
		// Never leave the app hidden if a navigation stalls.
		const failsafe = setTimeout(reveal, 3000);
		try {
			// Opened from a link: the link wins over the interrupted visit.
			if (IS_NATIVE) {
				const launch = await App.getLaunchUrl().catch(() => null);
				if (launch?.url) {
					cancelRestore();
					return;
				}
			}
			const here = location.pathname + location.search;
			if (stack.length === 1 && stack[0] === here) return; // the page restored itself
			setReplaying(true);
			if (stack[0] !== here) await goto(stack[0], { replaceState: true });
			for (const url of stack.slice(1)) await goto(url);
		} catch {
			// A failed replay just leaves the user wherever it got to.
		} finally {
			setReplaying(false);
			clearTimeout(failsafe);
			reveal();
		}
	}

	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (
				cb: () => Promise<void> | void
			) => { skipTransition: () => void; finished: Promise<void> };
		};
		if (!doc.startViewTransition) return;

		// Rebuilding the back stack after a restart is not something to animate.
		if (isReplaying()) return;

		// The edge-swipe-back gesture already animated the route off; skip
		// the View Transitions slide to avoid a double-animation.
		if (document.documentElement.dataset.edgeSwipeBackPending === 'true') {
			return;
		}

		// Skip transitions for in-page navigations (same pathname, query
		// only changed) — e.g., the search page updates ?tab=subreddits as
		// the user taps result tabs. We don't want a slide animation for
		// what is conceptually a stay-in-place state change.
		if (navigation.from?.url.pathname === navigation.to?.url.pathname) {
			return;
		}

		// Cut off any animation still in-flight before we start a new one.
		if (activeTransition) {
			activeTransition.skipTransition();
			activeTransition = null;
		}

		// Between the bottom bar's own tabs nothing is "further in" than
		// anything else. Sliding the whole screen for that read as leaving for
		// a new page every time a tab was tapped. So no page transition here:
		// the new tab's page fades in by itself (afterNavigate), and the bar,
		// left out of it, is free to move its highlight. Anything else
		// slides: in from the right going deeper, back out to the right on Back.
		const from = navigation.from?.url.pathname ?? '';
		const to = navigation.to?.url.pathname ?? '';
		if (TAB_ROOTS.has(from) && TAB_ROOTS.has(to)) {
			tabSwitch = true;
			return;
		}
		document.documentElement.dataset.navDir = navigation.type === 'popstate' ? 'back' : 'forward';

		return new Promise((resolve) => {
			const transition = doc.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
			activeTransition = transition;
			transition.finished.finally(() => {
				if (activeTransition === transition) activeTransition = null;
			});
		});
	});

	// Reddit links from a browser can open here, but only after the user turns
	// that on in Android's settings, and nothing about the app suggests it. Say
	// so once, with a button that goes straight to the right screen.
	async function hintLinkHandlingOnce() {
		if ($prefs.linkHintShown) return;
		const state = await getLinkHandling();
		if (state.kind !== 'setting' || state.total === 0 || state.enabled >= state.total) return;
		prefs.update((p) => ({ ...p, linkHintShown: true }));
		// After the What's New sheet, not underneath it.
		setTimeout(() => {
			pushToast('Reddit links from your browser can open in Persimmon', {
				key: 'link-hint',
				duration: 8000,
				action: { label: 'Set up', onClick: () => void openLinkHandlingSettings() }
			});
		}, 2500);
	}

	let unsubIntro: (() => void) | null = null;
	onMount(() => {
		// Boot milestones, readable from DevTools (performance.getEntriesByName).
		performance.mark('persimmon:mounted');
		initTheme();
		// Warm Reddit's anonymous cookies early so the first feed fetch is fast.
		warmupReddit();
		// Hide the splash as soon as the shell has painted (skeletons cover the
		// feed load) instead of sitting out the fixed 1.5s launch duration.
		// With the launch animation, that component takes the launch screen
		// down itself, timed against its own start.
		if (!playIntro) {
			requestAnimationFrame(() =>
				requestAnimationFrame(() => SplashScreen.hide().catch(() => undefined))
			);
		}
		const stopLazy = startLazyScroll(
			() => $prefs.lazyMode,
			() => $prefs.lazyModePxPerSec
		);
		const stopDeepLinks = installDeepLinks();
		const stopBack = installBackHandler();
		const stopAutoBackup = startAutoBackup();
		const stopSession = installSessionPersistence();
		const stopLock = installLock();
		if (restoredStack) void replaySession(restoredStack);

		// Some devices return from the lock screen or recents showing only the
		// background colour until the first touch. Committing any change makes
		// the compositor produce a frame, which is all the touch was doing.
		const onShow = () => {
			// Going to the background: a video playing in the feed stops.
			if (document.visibilityState === 'hidden') stopInlineVideo();
			if (document.visibilityState !== 'visible') return;
			// Back from Android's install-permission screen: carry on with the
			// update. And a release may have come out while the app sat in the
			// background (the check itself is throttled).
			void resumeAfterPermission();
			void checkForUpdates();
			requestAnimationFrame(() => {
				const nudge = document.createElement('div');
				nudge.style.cssText =
					'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none';
				document.body.appendChild(nudge);
				requestAnimationFrame(() => nudge.remove());
			});
		};
		document.addEventListener('visibilitychange', onShow);
		// Once prefs hydrate (so we read the real lastSeenVersion, not the
		// default): show the What's New sheet after an update, then quietly check
		// GitHub for a newer APK (throttled to once a day inside).
		prefs.ready.then(() => {
			// For next launch, which has to decide before prefs have loaded.
			unsubIntro = prefs.subscribe((p) => mirrorIntroPref(p.launchAnimation));
			openWhatsNewIfUpdated();
			checkForUpdates();
			void hintLinkHandlingOnce();
		});
		return () => {
			stopLazy();
			stopDeepLinks();
			stopBack();
			stopAutoBackup();
			stopSession();
			stopLock();
			unsubIntro?.();
			document.removeEventListener('visibilitychange', onShow);
		};
	});
</script>

<svelte:head>
	<title>Persimmon</title>
</svelte:head>

<div class="app" use:edgeSwipeBack>
	<main class="main" bind:this={mainEl} aria-hidden={layerId ? 'true' : undefined}>
		{@render children()}
	</main>
	<BottomNav />
</div>

{#if layerId}
	<!-- No pointer events on the way out: the list is usable the moment Back is
	     pressed, not when the slide finishes. -->
	<div
		class="post-layer"
		bind:this={layerEl}
		in:layerIn
		out:layerOut
		onoutrostart={(e) => ((e.currentTarget as HTMLElement).style.pointerEvents = 'none')}
	>
		<div class="post-layer-page">
			{#key layerId}
				<PostPage id={layerId} layered scroller={layerEl} seed={seedFor(layerId)} />
			{/key}
		</div>
	</div>
{/if}

{#if $appLocked}
	<LockScreen name="Persimmon" confirm={confirmApp} open={openApp} stillLocked={() => get(appLocked)} />
{:else if privatePostLocked}
	<LockScreen
		name="Private folder"
		confirm={confirmPrivate}
		open={() => privateUnlocked.set(true)}
		stillLocked={() => !get(privateUnlocked)}
	/>
{/if}

{#if playIntro}
	<BootIntro />
{/if}

<NavDrawer />
<ImageViewer />
<PostActionSheet />
<WhatsNew />
<UpdateSheet />
<SubredditInfoSheet />
<FeedEditSheet />
<Toast />

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		/* Room for the bottom bar, which is fixed over the end of the page.
		   BottomNav publishes its real height; the fallback is its height
		   before that has happened. */
		padding-bottom: var(--bottom-nav-h, calc(62px + env(safe-area-inset-bottom)));
	}
	.main {
		flex: 1;
		min-height: 0;
	}
	/* Over the page (and its sticky app bar), under the bottom bar. */
	.post-layer {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: var(--bottom-nav-h, 60px);
		z-index: 20;
		overflow-x: hidden;
		overflow-y: auto;
		/* Reaching either end must not start scrolling the list underneath. */
		overscroll-behavior: contain;
		background: var(--md-sys-color-surface);
	}
	/* Always a pixel taller than the layer, so it is a real scroller even for
	   a short post: containment above only applies to something that scrolls. */
	.post-layer-page {
		min-height: calc(100% + 1px);
	}
</style>
