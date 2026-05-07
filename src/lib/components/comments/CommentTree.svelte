<script lang="ts">
	import CommentChildren from './CommentChildren.svelte';
	import type { CommentNode } from '$lib/reddit/types';

	interface Props {
		comments: CommentNode[];
		linkFullId: string;
		opAuthor?: string;
	}

	let { comments = $bindable(), linkFullId, opAuthor }: Props = $props();
</script>

<section class="tree">
	{#if comments.length === 0}
		<div class="empty">No comments yet.</div>
	{:else}
		<CommentChildren bind:nodes={comments} {linkFullId} {opAuthor} />
	{/if}
</section>

<style>
	.tree {
		padding: 4px 8px 24px;
	}
	.empty {
		padding: 32px 16px;
		text-align: center;
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
