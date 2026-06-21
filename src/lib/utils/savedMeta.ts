// Snapshot the few Post fields the /saved screen needs to render a row, so we
// don't have to refetch every saved post over the network. Mirrors hiddenMeta.

import type { Post } from '$lib/reddit/types';
import type { SavedMeta } from '$lib/stores/saved';

export function savedMetaFromPost(post: Post): SavedMeta {
	return {
		title: post.title,
		subreddit: post.subreddit,
		author: post.author,
		thumbnail: post.thumbnail || post.preview?.url || post.image?.url,
		permalink: post.permalink,
		nsfw: post.over18
	};
}
