import { describe, expect, it } from 'vitest';
import { parseRedditUrl } from './parseRedditUrl';

describe('parseRedditUrl', () => {
	it('maps subreddit URLs', () => {
		expect(parseRedditUrl('https://www.reddit.com/r/AskReddit')).toEqual({
			pathname: '/r/AskReddit'
		});
		expect(parseRedditUrl('https://reddit.com/r/programming/')).toEqual({
			pathname: '/r/programming'
		});
		expect(parseRedditUrl('https://old.reddit.com/r/aww/hot')).toEqual({
			pathname: '/r/aww'
		});
		expect(parseRedditUrl('https://m.reddit.com/r/news/new/')).toEqual({
			pathname: '/r/news'
		});
	});

	it('maps comments URLs from any /r/<sub>/comments path', () => {
		expect(
			parseRedditUrl('https://www.reddit.com/r/programming/comments/abcdef/some_slug/')
		).toEqual({ pathname: '/comments/abcdef' });
		// With a comment-id suffix — we still land on the post (comment-level deep link is future scope).
		expect(
			parseRedditUrl('https://www.reddit.com/r/aww/comments/abc123/slug/xyz456/')
		).toEqual({ pathname: '/comments/abc123' });
	});

	it('maps bare /comments/<id> URLs', () => {
		expect(parseRedditUrl('https://www.reddit.com/comments/xyz789')).toEqual({
			pathname: '/comments/xyz789'
		});
	});

	it('maps user URLs (both /u/ and /user/)', () => {
		expect(parseRedditUrl('https://www.reddit.com/u/spez')).toEqual({
			pathname: '/u/spez'
		});
		expect(parseRedditUrl('https://www.reddit.com/user/spez/')).toEqual({
			pathname: '/u/spez'
		});
	});

	it('maps redd.it short links', () => {
		expect(parseRedditUrl('https://redd.it/abcdef')).toEqual({
			pathname: '/comments/abcdef'
		});
	});

	it('strips query strings and hash fragments', () => {
		expect(
			parseRedditUrl('https://www.reddit.com/r/news?utm_source=foo&utm_campaign=bar')
		).toEqual({ pathname: '/r/news' });
		expect(parseRedditUrl('https://www.reddit.com/r/news#anchor')).toEqual({
			pathname: '/r/news'
		});
	});

	it('returns null for unrecognized hosts', () => {
		expect(parseRedditUrl('https://example.com/r/AskReddit')).toBeNull();
		expect(parseRedditUrl('https://google.com/')).toBeNull();
	});

	it('returns null for unrecognized Reddit paths', () => {
		expect(parseRedditUrl('https://www.reddit.com/messages')).toBeNull();
		expect(parseRedditUrl('https://www.reddit.com/me')).toBeNull();
		expect(parseRedditUrl('https://www.reddit.com/preferences')).toBeNull();
		expect(parseRedditUrl('https://www.reddit.com/')).toBeNull();
	});

	it('returns null for malformed input', () => {
		expect(parseRedditUrl('not a url')).toBeNull();
		expect(parseRedditUrl('')).toBeNull();
	});

	it('handles URLs missing trailing/extra segments', () => {
		expect(parseRedditUrl('https://www.reddit.com/r/')).toBeNull(); // no sub name
		expect(parseRedditUrl('https://www.reddit.com/comments/')).toBeNull(); // no id
		expect(parseRedditUrl('https://redd.it/')).toBeNull(); // no id
	});
});
