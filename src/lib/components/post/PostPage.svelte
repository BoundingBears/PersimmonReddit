<script lang="ts">
	// One post and its comments, with its own app bar.
	//
	// Used two ways. As the /comments/[id] route it is the page, and scrolls
	// with the window. Opened from a list it sits in the layer the layout puts
	// over that list (postLayer.ts), and scrolls inside `scroller` so the list
	// underneath keeps the window, untouched, for when the user comes back.
	import ErrorState from '$lib/components/shared/ErrorState.svelte';
	import { onDestroy, tick, untrack } from 'svelte';
	import TopAppBar from '$lib/components/chrome/TopAppBar.svelte';
	import PostDetail from './PostDetail.svelte';
	import PostSkeleton from './PostSkeleton.svelte';
	import CommentTree from '$lib/components/comments/CommentTree.svelte';
	import PullIndicator from '$lib/components/shared/PullIndicator.svelte';
	import Dropdown from '$lib/components/shared/Dropdown.svelte';
	import { getSubmissionComments } from '$lib/reddit/endpoints';
	import { prefs } from '$lib/stores/prefs';
	import { readPosts } from '$lib/stores/readPosts';
	import { readOffline, storeOffline, type OfflineCopy } from '$lib/stores/offline';
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import { consumeRestoredScroll, peekRestoredScroll } from '$lib/stores/session';
	import { IS_IOS } from '$lib/utils/platform';
	import { pullToRefresh, type PullToRefreshState } from '$lib/actions/pullToRefresh';
	import type { CommentNode, CommentSort, Post } from '$lib/reddit/types';

	interface Props {
		id: string;
		// In the layer over a list rather than a page of its own.
		layered?: boolean;
		// The layer's scrolling element. Absent: the window scrolls.
		scroller?: HTMLElement | null;
		// The post as the list already had it, shown at once while the comments
		// are fetched.
		seed?: Post;
	}

	let { id, layered = false, scroller = null, seed }: Props = $props();

	const seeded = untrack(() => !!seed && seed.id === id);
	let post = $state<Post | null>(untrack(() => (seeded && seed ? seed : null)));
	let comments = $state<CommentNode[]>([]);
	let loading = $state(false);
	let loadedOnce = $state(false);
	let error = $state<string | null>(null);
	let sort = $state<CommentSort>($prefs.defaultCommentSort);
	// Showing the copy kept on the device for a saved post (offline.ts), and
	// when it was written. `offline` once Reddit could not be reached, which
	// is when the user needs telling that this is not the live post.
	let copyAt = $state<number | null>(null);
	let offline = $state(false);

	function showCopy(copy: OfflineCopy) {
		post = copy.post;
		comments = copy.comments;
		copyAt = copy.at;
		loadedOnce = true;
	}

	const sortOptions: CommentSort[] = ['best', 'top', 'new', 'controversial', 'old', 'qa'];

	function scrollTop(): number {
		return scroller ? scroller.scrollTop : window.scrollY;
	}
	function scrollTo(top: number) {
		(scroller ?? window).scrollTo({ top });
	}

	// The seeded post is already on screen, possibly with a video playing.
	// Replacing the whole object would hand every media component new props
	// and restart it, so only the plain values that can have changed since the
	// list was fetched (score, comment count, edited text) are copied across.
	function patch(shown: Post, fresh: Post) {
		const a = shown as unknown as Record<string, unknown>;
		const b = fresh as unknown as Record<string, unknown>;
		for (const key of Object.keys(b)) {
			const value = b[key];
			if (value !== null && typeof value === 'object') continue;
			if (a[key] !== value) a[key] = value;
		}
	}

	// Monotonic token + a destroyed flag so a slow load that resolves after the
	// user has already gone back can't scroll the *feed* to the top — that was
	// silently undoing the feed's own scroll restoration on a fast back-press.
	let loadGen = 0;
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
		loadGen++;
	});

	async function load() {
		if (!id) return;
		const gen = ++loadGen;
		loading = true;
		error = null;
		try {
			// A saved post is on the device: put it on screen now rather than
			// after the network has answered (or failed to).
			if (!post) {
				void readOffline(id).then((copy) => {
					if (copy && gen === loadGen && !destroyed && !post) showCopy(copy);
				});
			}
			const r = await getSubmissionComments(id, { sort });
			if (gen !== loadGen || destroyed) return;
			if (!r.ok || r.meta?.staleAt) {
				// Nothing fresh from Reddit. The kept copy, if there is one, is
				// the whole post with its pictures, which a cached response is not.
				const copy = copyAt === null ? await readOffline(id) : null;
				if (gen !== loadGen || destroyed) return;
				if (copy) showCopy(copy);
				if (copyAt !== null) {
					offline = true;
					return;
				}
			}
			if (!r.ok) {
				error = r.error.message;
				return;
			}
			// Patch a post seeded from a list; replace anything else, including
			// a device copy, whose pictures are the kept ones and not the originals.
			if (post && post.id === r.data.post.id && seeded && copyAt === null) patch(post, r.data.post);
			else post = r.data.post;
			comments = r.data.comments;
			copyAt = null;
			offline = false;
			// Does nothing unless the post is saved or in the private folder.
			void storeOffline(id, r.data);
			if ($prefs.markPostsRead) readPosts.mark(id);
			const first = !loadedOnce;
			loadedOnce = true;
			// A layer opens at the top with the post already showing, and the
			// user may be reading by the time the comments land: leave it be.
			if (layered && first) return;
			// Normally the top. After the app was killed mid-read and restored,
			// the offset the user had reached in this post (session.ts).
			const resumeAt = peekRestoredScroll(`/comments/${id}`);
			if (resumeAt) await tick();
			if (gen !== loadGen || destroyed) return;
			scrollTo(resumeAt ?? 0);
			if (resumeAt) consumeRestoredScroll();
		} catch (e) {
			if (gen !== loadGen || destroyed) return;
			console.error('post detail load failed', id, e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	$effect(() => {
		id;
		sort;
		untrack(() => load());
	});

	let pullDistance = $state(0);
	let refreshing = $state(false);
	function onPullState(s: PullToRefreshState) {
		pullDistance = s.distance;
		refreshing = s.refreshing;
	}

	// On iOS we never render NSFW posts (no toggle to override). Direct
	// links to over18 posts (URL paste, search results) hit a placeholder
	// instead of the post / comments / media.
	let blockedNsfw = $derived(IS_IOS && !!post?.over18);
</script>

<TopAppBar
	title={post ? `r/${post.subreddit}` : 'Loading…'}
	titleHref={post ? `/r/${post.subreddit}` : undefined}
	dense
	showBack
>
	{#snippet actions()}
		<Dropdown bind:value={sort} options={sortOptions} label="Comment sort" />
	{/snippet}
</TopAppBar>

{#if error}
	<ErrorState message={error} onRetry={load} />
{/if}

<div class="ptr" use:pullToRefresh={{ onRefresh: load, onState: onPullState, scrollTop }}>
	<PullIndicator distance={pullDistance} {refreshing} />
	{#if post && blockedNsfw}
		<div class="blocked">
			<div class="blocked-title">Adult content</div>
			<div class="blocked-sub">
				This post is marked NSFW and isn't available in this app.
			</div>
		</div>
	{:else if post}
		{#if offline && copyAt}
			<div class="offline-note">
				<Icon name="cloud_off" size={16} />
				<span>
					Can't reach Reddit. Showing the copy saved on your phone
					<span aria-hidden="true">·</span>
					<RelativeTime ts={Math.floor(copyAt / 1000)} />
				</span>
			</div>
		{/if}
		<PostDetail {post} />
		{#if loading && !loadedOnce}
			<!-- The post came from the list; only its comments are still on the way. -->
			<PostSkeleton commentsOnly />
		{:else}
			<CommentTree bind:comments linkFullId={post.fullId} opAuthor={post.author} />
		{/if}
	{:else if loading}
		<PostSkeleton />
	{/if}
</div>

<style>
	.ptr {
		position: relative;
		overscroll-behavior-y: contain;
		touch-action: pan-y;
	}
	.offline-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px;
		padding: 8px 12px;
		border-radius: 8px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--type-meta);
	}
	.blocked {
		padding: 48px 24px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
	.blocked-title {
		font-size: var(--type-title);
		font-weight: var(--weight-title);
		color: var(--md-sys-color-on-surface);
		margin-bottom: 6px;
	}
	.blocked-sub {
		font-size: var(--type-secondary);
		line-height: 1.5;
	}
</style>
