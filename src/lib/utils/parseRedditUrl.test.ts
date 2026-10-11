import { describe, expect, it } from 'vitest';
import { isShareLink, parseRedditUrl } from './parseRedditUrl';

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
		// The bare homepage used to be ignored too. It now opens the front page,
		// see "the front page, with or without a sort" below.
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

describe('parseRedditUrl: links as they arrive from a browser', () => {
	const path = (u: string) => parseRedditUrl(u)?.pathname ?? null;

	it('a Google result for a post', () =>
		expect(path('https://www.reddit.com/r/AskReddit/comments/1x355ez/whats_a_canon_event/?rdt=12345')).toBe(
			'/comments/1x355ez'
		));
	it('a translated result keeps working', () =>
		expect(path('https://www.reddit.com/r/pics/comments/1x2pthb/some_title/?tl=de')).toBe('/comments/1x2pthb'));
	it('a comment permalink lands on its post', () =>
		expect(path('https://www.reddit.com/r/pics/comments/1x2pthb/some_title/kq9abc1/')).toBe('/comments/1x2pthb'));
	it('uppercase ids are normalised', () => expect(path('https://redd.it/1X2PTHB')).toBe('/comments/1x2pthb'));
	it('a post made on a profile', () =>
		expect(path('https://www.reddit.com/user/someone/comments/1x2pthb/my_post/')).toBe('/comments/1x2pthb'));
	it.each(['gallery', 'poll', 'video'])('/%s/<id> is the same post', (kind) =>
		expect(path(`https://www.reddit.com/${kind}/1x2pthb`)).toBe('/comments/1x2pthb'));
	it('amp and sh hosts', () => {
		expect(path('https://amp.reddit.com/r/pics/comments/1x2pthb/t/')).toBe('/comments/1x2pthb');
		expect(path('https://sh.reddit.com/r/pics/')).toBe('/r/pics');
	});
	it('the front page, with or without a sort', () => {
		expect(path('https://www.reddit.com/')).toBe('/');
		expect(path('https://www.reddit.com')).toBe('/');
		expect(path('https://www.reddit.com/top/?t=week')).toBe('/');
	});
	it('a subreddit with a sort or sub-page', () => {
		expect(path('https://www.reddit.com/r/pics/top/?t=week')).toBe('/r/pics');
		expect(path('https://www.reddit.com/r/pics/wiki/index')).toBe('/r/pics');
	});
	it('search carries its query', () => {
		expect(path('https://www.reddit.com/search/?q=best+android+client')).toBe('/search?q=best%20android%20client');
		expect(path('https://www.reddit.com/r/Android/search?q=persimmon&restrict_sr=1')).toBe('/search?q=persimmon');
		expect(path('https://www.reddit.com/search')).toBe('/search');
	});
	it('a malformed post id does not produce a route to nowhere', () => {
		expect(path('https://www.reddit.com/comments/not_an_id!')).toBeNull();
		expect(path('https://www.reddit.com/r/pics/comments/')).toBe('/r/pics');
	});
	it('pages with no screen in the app', () => {
		expect(path('https://www.reddit.com/message/inbox')).toBeNull();
		expect(path('https://www.reddit.com/settings')).toBeNull();
		expect(path('https://example.com/r/pics')).toBeNull();
		expect(path('javascript:alert(1)')).toBeNull();
	});
});

describe('isShareLink', () => {
	it.each([
		'https://www.reddit.com/r/pics/s/AbCdEf1234',
		'https://reddit.com/r/pics/s/AbCdEf1234?utm_source=share',
		'https://www.reddit.com/u/someone/s/AbCdEf1234'
	])('%s', (u) => {
		expect(isShareLink(u)).toBe(true);
		// Cannot be mapped without following the redirect.
		expect(parseRedditUrl(u)).toBeNull();
	});
	it.each([
		'https://www.reddit.com/r/pics/comments/1x2pthb/s/',
		'https://www.reddit.com/r/pics/',
		'https://example.com/r/pics/s/AbCdEf1234',
		'nonsense'
	])('not a share link: %s', (u) => expect(isShareLink(u)).toBe(false));
});
