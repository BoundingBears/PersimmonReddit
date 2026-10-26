<script lang="ts">
	import CommentNode from './CommentNode.svelte';
	import LoadMore from './LoadMore.svelte';
	import type { CommentNode as Node } from '$lib/reddit/types';

	interface Props {
		nodes: Node[];
		linkFullId: string;
		opAuthor?: string;
	}

	let { nodes = $bindable(), linkFullId, opAuthor }: Props = $props();

	function expandStub(index: number, replacement: Node[]) {
		// Replies read from a comment's page include any the thread already
		// showed; the same comment twice would break the list.
		const shown = new Set(nodes.flatMap((n) => (n.kind === 'comment' ? [n.fullId] : [])));
		const fresh = replacement.filter((n) => n.kind !== 'comment' || !shown.has(n.fullId));
		nodes = [...nodes.slice(0, index), ...fresh, ...nodes.slice(index + 1)];
	}
</script>

<div class="children">
	{#each nodes as node, i (node.kind === 'comment' ? node.fullId : 'more-' + node.id + '-' + i)}
		{#if node.kind === 'comment'}
			<CommentNode comment={node} {linkFullId} {opAuthor} />
		{:else}
			<LoadMore stub={node} {linkFullId} onLoaded={(r) => expandStub(i, r)} />
		{/if}
	{/each}
</div>

<style>
	.children {
		display: flex;
		flex-direction: column;
	}
</style>
