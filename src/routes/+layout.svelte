<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
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
	import PostActionSheet from '$lib/components/shared/PostActionSheet.svelte';
	import WhatsNew from '$lib/components/shared/WhatsNew.svelte';
	import SubredditInfoSheet from '$lib/components/shared/SubredditInfoSheet.svelte';
	import FeedEditSheet from '$lib/components/shared/FeedEditSheet.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import { openWhatsNewIfUpdated } from '$lib/stores/whatsNew';

	let { children } = $props();

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

	// Maintain a stack of HTML snapshots of pages we've visited, so the iOS
	// edge-swipe-back gesture can render a real preview of the previous page
	// underneath the current one. Forward nav pushes the leaving page;
	// popstate-back pops it (so the next back-swipe peek is the page further
	// back in history, not the one we just popped). See pageSnapshot.ts.
	beforeNavigate((nav) => {
		if (nav.type === 'popstate' && (nav.delta ?? 0) < 0) {
			popPageSnapshot();
		} else {
			pushPageSnapshot();
		}
	});

	// The edge-swipe-back gesture defers some DOM cleanup until after the
	// route is mounted, to avoid a flicker between "snapshot peek" and
	// "real new page". This drains that cleanup at the right moment.
	afterNavigate(() => {
		consumeEdgeSwipeBackCleanup();
	});

	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (
				cb: () => Promise<void> | void
			) => { skipTransition: () => void; finished: Promise<void> };
		};
		if (!doc.startViewTransition) return;

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

		document.documentElement.dataset.navDir =
			navigation.type === 'popstate' ? 'back' : 'forward';

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

	onMount(() => {
		initTheme();
		// Warm Reddit's anonymous cookies early so the first feed fetch is fast.
		warmupReddit();
		// Hide the splash as soon as the shell has painted (skeletons cover the
		// feed load) instead of sitting out the fixed 1.5s launch duration.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => SplashScreen.hide().catch(() => undefined))
		);
		const stopLazy = startLazyScroll(
			() => $prefs.lazyMode,
			() => $prefs.lazyModePxPerSec
		);
		const stopDeepLinks = installDeepLinks();
		const stopBack = installBackHandler();
		// Show the What's New sheet once after an update (gated on prefs hydrate
		// so we read the real lastSeenVersion, not the default).
		prefs.ready.then(() => openWhatsNewIfUpdated());
		return () => {
			stopLazy();
			stopDeepLinks();
			stopBack();
		};
	});
</script>

<svelte:head>
	<title>Persimmon</title>
</svelte:head>

<div class="app" use:edgeSwipeBack>
	<main class="main">
		{@render children()}
	</main>
	<BottomNav />
</div>

<NavDrawer />
<ImageViewer />
<PostActionSheet />
<WhatsNew />
<SubredditInfoSheet />
<FeedEditSheet />
<Toast />

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.main {
		flex: 1;
		min-height: 0;
	}
</style>
