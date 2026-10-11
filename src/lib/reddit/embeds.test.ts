import { describe, it, expect } from 'vitest';
import { resolveEmbed, isEmbeddableUrl } from './embeds';
import { detectKind } from './media';

describe('resolveEmbed: YouTube', () => {
	const id = 'kHpYjxQDUDk';
	it.each([
		`https://www.youtube.com/watch?v=${id}`,
		`https://youtube.com/watch?v=${id}&feature=share`,
		`https://m.youtube.com/watch?v=${id}`,
		`https://music.youtube.com/watch?v=${id}`,
		`https://youtu.be/${id}`,
		`https://youtu.be/${id}?si=abc`,
		`https://www.youtube.com/embed/${id}`,
		`https://www.youtube.com/live/${id}`
	])('%s', (url) => {
		const e = resolveEmbed(url);
		expect(e?.provider).toBe('youtube');
		expect(e?.src).toContain(`https://www.youtube-nocookie.com/embed/${id}?`);
		expect(e?.aspect).toBeCloseTo(9 / 16);
	});

	it('shorts are portrait', () => {
		const e = resolveEmbed(`https://youtube.com/shorts/${id}`);
		expect(e?.provider).toBe('youtube');
		expect(e?.aspect).toBeCloseTo(16 / 9);
	});

	it.each([
		['t=90', 90],
		['t=90s', 90],
		['t=1m30s', 90],
		['t=1h2m3s', 3723],
		['start=45', 45]
	])('start time %s', (q, secs) => {
		expect(resolveEmbed(`https://youtu.be/${id}?${q}`)?.src).toContain(`start=${secs}`);
	});

	it('no start param when there is no timestamp', () => {
		expect(resolveEmbed(`https://youtu.be/${id}`)?.src).not.toContain('start=');
	});

	it.each([
		'https://www.youtube.com/@somechannel',
		'https://www.youtube.com/playlist?list=PL123',
		'https://www.youtube.com/watch?v=tooshort',
		'https://youtu.be/'
	])('not a video: %s', (url) => expect(resolveEmbed(url)).toBeNull());
});

describe('resolveEmbed: Twitch', () => {
	const slug = 'InexpensiveHotGrouseNerfBlueBlaster--wdg-mRtFp79lgSC';
	it.each([
		`https://www.twitch.tv/xqc/clip/${slug}`,
		`https://twitch.tv/xqc/clip/${slug}?filter=clips`,
		`https://m.twitch.tv/xqc/clip/${slug}`,
		`https://m.twitch.tv/clip/${slug}`,
		`https://clips.twitch.tv/${slug}`,
		`https://clips.twitch.tv/embed?clip=${slug}&parent=reddit.com`
	])('%s', (url) => {
		expect(resolveEmbed(url)).toEqual({
			provider: 'twitch',
			src: `https://clips.twitch.tv/embed?clip=${slug}&parent=localhost&autoplay=true`,
			aspect: 9 / 16
		});
	});

	it('uses the embedding page as parent, which Twitch requires', () => {
		expect(resolveEmbed(`https://clips.twitch.tv/${slug}`, 'example.org')?.src).toContain('parent=example.org');
	});

	it('VOD', () => {
		expect(resolveEmbed('https://www.twitch.tv/videos/123456789')?.src).toBe(
			'https://player.twitch.tv/?video=123456789&parent=localhost&autoplay=true'
		);
	});

	it('a bare channel page is not a clip', () => {
		expect(resolveEmbed('https://www.twitch.tv/xqc')).toBeNull();
	});
});

describe('resolveEmbed: Streamable and Vimeo', () => {
	it.each(['https://streamable.com/byh8a0', 'https://www.streamable.com/byh8a0', 'https://streamable.com/e/byh8a0'])(
		'%s',
		(url) => expect(resolveEmbed(url)?.src).toBe('https://streamable.com/e/byh8a0?autoplay=1')
	);
	it('vimeo', () =>
		expect(resolveEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1'));
});

describe('resolveEmbed: everything else', () => {
	it.each([
		undefined,
		'',
		'not a url',
		'javascript:alert(1)',
		'https://example.com/article',
		'https://kick.com/somebody',
		'https://v.redd.it/abc123'
	])('%s -> null', (url) => {
		expect(resolveEmbed(url as string | undefined)).toBeNull();
		expect(isEmbeddableUrl(url as string | undefined)).toBe(false);
	});
});

// The regression that made videos vanish: Reddit hints third-party players as
// `rich:video`, and that used to be classed as a Reddit-hosted 'video'.
describe('detectKind: third-party video', () => {
	it('rich:video is an embed, not a hosted video', () =>
		expect(
			detectKind({ post_hint: 'rich:video', media: { type: 'youtube.com' }, url: 'https://youtu.be/kHpYjxQDUDk' })
		).toBe('embed'));
	it('rich:video with no media object at all is still an embed', () =>
		expect(detectKind({ post_hint: 'rich:video', url: 'https://streamable.com/byh8a0' })).toBe('embed'));
	it('hosted:video stays a video', () =>
		expect(detectKind({ post_hint: 'hosted:video', url: 'https://v.redd.it/abc' })).toBe('video'));
	it('reddit_video only under secure_media', () =>
		expect(detectKind({ secure_media: { reddit_video: {} } })).toBe('video'));
	it('embed content only under secure_media_embed', () =>
		expect(detectKind({ media_embed: {}, secure_media_embed: { content: '<iframe></iframe>' }, url: 'https://x.test/a' })).toBe(
			'embed'
		));
	it('known provider link with no hint and no media', () =>
		expect(detectKind({ url: 'https://youtu.be/kHpYjxQDUDk' })).toBe('embed'));
	it('an image link is still an image even on a provider-looking path', () =>
		expect(detectKind({ post_hint: 'image', url: 'https://i.ytimg.com/vi/kHpYjxQDUDk/hq.jpg' })).toBe('image'));
	it('ordinary links are unaffected', () =>
		expect(detectKind({ post_hint: 'link', url: 'https://example.com/article' })).toBe('link'));
});
