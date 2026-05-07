<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import RelativeTime from '$lib/components/shared/RelativeTime.svelte';
	import UserChip from '$lib/components/shared/UserChip.svelte';
	import SelfText from '$lib/components/post/SelfText.svelte';
	import { formatScore } from '$lib/utils/format';
	import type { Comment, CommentNode as Node } from '$lib/reddit/types';
	import CommentChildren from './CommentChildren.svelte';

	interface Props {
		comment: Comment;
		linkFullId: string;
		opAuthor?: string;
	}

	let { comment, linkFullId, opAuthor }: Props = $props();
	let collapsed = $state(false);
	// Step hue by the golden angle so adjacent depths land far apart on the
	// color wheel — keeps depths visually distinct at any nesting level
	// instead of cycling through a fixed 6-color palette.
	let depthTone = $derived(`oklch(0.78 0.12 ${((290 + comment.depth * 137.508) % 360).toFixed(1)})`);

	function toggle() {
		collapsed = !collapsed;
	}

	let totalReplies = $derived(countReplies(comment.replies));
	function countReplies(nodes: Node[]): number {
		let n = 0;
		for (const c of nodes) {
			if (c.kind === 'comment') n += 1 + countReplies(c.replies);
			else n += c.count;
		}
		return n;
	}
</script>

<div class="node" style:--depth-color={depthTone}>
	<button class="rail" onclick={toggle} aria-label={collapsed ? 'Expand' : 'Collapse'}></button>
	<div class="body">
		<button class="header" onclick={toggle}>
			<UserChip name={comment.author} />
			{#if comment.isSubmitter}
				<span class="op">OP</span>
			{:else if opAuthor && comment.author === opAuthor}
				<span class="op">OP</span>
			{/if}
			{#if comment.distinguished === 'moderator'}
				<span class="mod">MOD</span>
			{:else if comment.distinguished === 'admin'}
				<span class="admin">ADMIN</span>
			{/if}
			<span class="score">{comment.scoreHidden ? '—' : formatScore(comment.score)}</span>
			<span class="dot">·</span>
			<RelativeTime ts={comment.createdUtc} />
			{#if comment.editedUtc}
				<span class="edited">·  edited</span>
			{/if}
			{#if collapsed && totalReplies > 0}
				<span class="hidden-count">[+{totalReplies}]</span>
			{/if}
		</button>
		{#if !collapsed}
			<div class="content">
				<SelfText html={comment.bodyHtml} md={comment.body} />
			</div>
			{#if comment.replies.length > 0}
				<CommentChildren nodes={comment.replies} {linkFullId} {opAuthor} />
			{/if}
		{/if}
	</div>
</div>

<style>
	.node {
		display: flex;
		gap: 8px;
		padding: 8px 0 8px 8px;
	}
	.rail {
		flex: none;
		width: 4px;
		border-radius: 2px;
		background: var(--depth-color);
		opacity: 0.5;
		cursor: pointer;
		align-self: stretch;
		min-height: 20px;
	}
	.rail:hover {
		opacity: 1;
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.header {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--md-sys-color-on-surface-variant);
		text-align: left;
		width: 100%;
		padding: 2px 0 6px;
	}
	.op {
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font-weight: 600;
		font-size: 10px;
	}
	.mod {
		padding: 1px 5px;
		border-radius: 4px;
		background: #2e7d32;
		color: #fff;
		font-weight: 600;
		font-size: 10px;
	}
	.admin {
		padding: 1px 5px;
		border-radius: 4px;
		background: #c62828;
		color: #fff;
		font-weight: 600;
		font-size: 10px;
	}
	.score {
		font-weight: 500;
		color: var(--md-sys-color-on-surface);
	}
	.dot {
		opacity: 0.6;
	}
	.edited {
		font-style: italic;
		opacity: 0.8;
	}
	.hidden-count {
		color: var(--md-sys-color-primary);
		font-weight: 500;
	}
	.content {
		padding-right: 4px;
	}
</style>
