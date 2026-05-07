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
		nodes = [...nodes.slice(0, index), ...replacement, ...nodes.slice(index + 1)];
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
