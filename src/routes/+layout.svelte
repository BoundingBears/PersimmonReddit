<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { initTheme } from '$lib/stores/theme';
	import { startLazyScroll } from '$lib/utils/lazyScroll';
	import { prefs } from '$lib/stores/prefs';
	import BottomNav from '$lib/components/chrome/BottomNav.svelte';
	import NavDrawer from '$lib/components/chrome/NavDrawer.svelte';
	import ImageViewer from '$lib/components/shared/ImageViewer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';

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

	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (
				cb: () => Promise<void> | void
			) => { skipTransition: () => void; finished: Promise<void> };
		};
		if (!doc.startViewTransition) return;

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
		const stop = startLazyScroll(
			() => $prefs.lazyMode,
			() => $prefs.lazyModePxPerSec
		);
		return stop;
	});
</script>

<svelte:head>
	<title>Persimmon</title>
</svelte:head>

<div class="app">
	<main class="main">
		{@render children()}
	</main>
	<BottomNav />
</div>

<NavDrawer />
<ImageViewer />
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
