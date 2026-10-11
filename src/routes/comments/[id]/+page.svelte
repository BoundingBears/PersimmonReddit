<script lang="ts">
	// A post as a page of its own: opened from a link, from inside another
	// post, or while the session is rebuilt after a restart. A post tapped in
	// a list is shown by the same component in a layer instead (postLayer.ts).
	import { page } from '$app/stores';
	import PostPage from '$lib/components/post/PostPage.svelte';

	let id = $derived($page.params.id ?? '');
</script>

<PostPage {id} />
