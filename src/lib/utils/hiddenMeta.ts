// Snapshot the few Post fields the /hidden screen needs to render a row,
// so we don't have to refetch every hidden post over the network.

import type { Post } from '$lib/reddit/types';
import type { HiddenMeta } from '$lib/stores/hidden';

export function hiddenMetaFromPost(post: Post): HiddenMeta {
	return {
		title: post.title,
		subreddit: post.subreddit,
		author: post.author,
		thumbnail: post.thumbnail || post.preview?.url || post.image?.url,
		permalink: post.permalink
	};
}
