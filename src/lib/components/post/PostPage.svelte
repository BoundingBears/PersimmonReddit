<script lang="ts">
	import { UNEXPECTED } from '$lib/reddit/failure';
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
	import { dataRouteLikelyOpen, getMoreCommentsFromPages, getSubmissionComments } from '$lib/reddit/endpoints';
	import { prefs } from '$lib/stores/prefs';
	import { readPosts } from '$lib/stores/readPosts';
	import { readOffline, storeOffline, type OfflineCopy } from '$lib/stores/offline';
	import { pushToast } from '$lib/stores/toast';
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
	// Reddit refused the thread and these comments are the few on the post's
	// web page (endpoints.ts): how many are shown, out of how many.
	let partial = $state<{ shown: number; total: number } | null>(null);
	let askingForAll = $state(false);
	// The other sort orders' pages have been read for more comments (below):
	// there is nothing left to ask for.
	let gotAllPagesGive = $state(false);

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
			// Media the seed already had stays as it is. Media it lacked (a post
			// seeded from a search result, which has no pictures) is added.
			if (value !== null && typeof value === 'object') {
				if (a[key] == null) a[key] = value;
				continue;
			}
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
				// The post itself is on screen (the list had it) even though its
				// comments are not, so it has been read.
				if (post && $prefs.markPostsRead) readPosts.mark(id);
				return;
			}
			// Patch a post seeded from a list; replace anything else, including
			// a device copy, whose pictures are the kept ones and not the originals.
			if (post && post.id === r.data.post.id && seeded && copyAt === null) patch(post, r.data.post);
			else post = r.data.post;
			comments = r.data.comments;
			copyAt = null;
			offline = false;
			partial = r.meta?.partial ?? null;
			gotAllPagesGive = false;
			// Does nothing unless the post is saved or in the private folder. Not
			// a partial thread: it would replace a complete saved copy.
			if (!partial) void storeOffline(id, r.data);
			// The few comments from the page are on screen now. Ask once more,
			// properly, for the whole thread, and swap it in if it comes. Not
			// while Reddit is known to be refusing: that is one more refusal.
			else if (dataRouteLikelyOpen()) void askForAll(true);
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
			error = UNEXPECTED;
		} finally {
			if (gen === loadGen) loading = false;
		}
	}

	$effect(() => {
		id;
		sort;
		untrack(() => load());
	});

	// More comments for a thread Reddit only partly gave: the ones its other
	// sort orders put first (endpoints.ts), added below the ones showing.
	let loadingMore = $state(false);
	async function loadMoreFromPages() {
		if (loadingMore) return;
		loadingMore = true;
		const gen = loadGen;
		try {
			const have = new Set(comments.flatMap((c) => (c.kind === 'comment' ? [c.id] : [])));
			const r = await getMoreCommentsFromPages(id, have, sort);
			if (gen !== loadGen || destroyed) return;
			if (!r.ok) {
				pushToast(r.error.message, { key: 'more-comments' });
				return;
			}
			gotAllPagesGive = true;
			if (r.data.length === 0) {
				pushToast('No more comments to load.', { key: 'more-comments' });
				return;
			}
			comments = [...comments, ...r.data];
			if (partial) partial = { ...partial, shown: partial.shown + r.data.length };
		} finally {
			loadingMore = false;
		}
	}

	// The whole thread, by the data route with everything it has. Slow when
	// Reddit is refusing (many seconds), which is why opening a post does not
	// wait for it. `quiet`: the automatic attempt, which says nothing if it
	// fails; the note under the comments already tells the user where they stand.
	async function askForAll(quiet = false) {
		if (askingForAll) return;
		askingForAll = true;
		const gen = loadGen;
		try {
			const r = await getSubmissionComments(id, { sort }, { whole: true });
			if (gen !== loadGen || destroyed) return;
			if (!r.ok || r.meta?.staleAt) {
				if (!quiet) pushToast('Reddit refused the rest of the thread.', { key: 'thread-refused' });
				return;
			}
			comments = r.data.comments;
			partial = null;
			void storeOffline(id, r.data);
		} finally {
			askingForAll = false;
		}
	}

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
		<!-- The post came from the list, so it is here whether or not its
		     comments arrive. When they do not, say so where they would be. -->
		{#if error}
			<ErrorState
				title="The comments didn't load"
				message={error}
				onRetry={load}
			/>
		{/if}
		{#if loading && !loadedOnce}
			<PostSkeleton commentsOnly />
		{:else if loadedOnce}
			<CommentTree bind:comments linkFullId={post.fullId} opAuthor={post.author} />
			{#if partial && !error}
				<div class="partial-note">
					<span>
						{#if gotAllPagesGive}
							These are all the comments Reddit's pages carry for this thread: {partial.shown} of {partial.total.toLocaleString()}. Tap More replies under any of them to read its replies.
						{:else if partial.total > partial.shown}
							Reddit only sends the first {partial.shown} of {partial.total.toLocaleString()} comments to apps that are not signed in. Tap More replies under any of them to read its replies.
						{:else}
							Reddit refused the full thread. Tap More replies under a comment to read its replies.
						{/if}
					</span>
					{#if !gotAllPagesGive}
						<button onclick={loadMoreFromPages} disabled={loadingMore}>
							{loadingMore ? 'Loading more comments…' : 'Load more comments'}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	{:else if error}
		<ErrorState title="This post didn't load" message={error} onRetry={load} />
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
	.partial-note {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		margin: 8px 8px 24px;
		padding: 14px 16px;
		border-radius: 12px;
		background: var(--md-sys-color-surface-container-high);
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--type-secondary);
		line-height: 1.45;
		text-align: center;
	}
	.partial-note button {
		padding: 8px 16px;
		border-radius: 20px;
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		font: inherit;
		font-weight: var(--weight-title);
	}
	.partial-note button:disabled {
		opacity: 0.6;
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
