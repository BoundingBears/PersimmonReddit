<script lang="ts">
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { openImage, openVideo } from '$lib/stores/imageViewer';

	interface Props {
		html?: string; // pre-rendered HTML from selftext_html / body_html
		md?: string; // raw markdown (selftext / body) — fallback
	}

	let { html, md }: Props = $props();

	// Module-level LRU cache for rendered + sanitized + media-inlined output.
	// Same selftext renders many times across re-renders (theme switches,
	// list re-keys, scroll-driven derivations) — re-running marked + DOMPurify
	// + DOM walking on every pass is wasted work.
	const RENDER_CACHE = new Map<string, string>();
	const RENDER_CACHE_MAX = 50;

	function cachedRender(key: string, compute: () => string): string {
		const hit = RENDER_CACHE.get(key);
		if (hit !== undefined) {
			// LRU touch: re-insert so this entry is freshest.
			RENDER_CACHE.delete(key);
			RENDER_CACHE.set(key, hit);
			return hit;
		}
		const value = compute();
		RENDER_CACHE.set(key, value);
		if (RENDER_CACHE.size > RENDER_CACHE_MAX) {
			const oldest = RENDER_CACHE.keys().next().value;
			if (oldest !== undefined) RENDER_CACHE.delete(oldest);
		}
		return value;
	}

	// Reddit comments often contain image/gif/video links rendered as plain
	// <a href="..."> tags. We detect those by URL pattern and inline an <img>
	// (or <video> for mp4/webm) inside the anchor so the media renders directly
	// in the comment. The <a> is preserved as a click target — a delegated
	// click handler intercepts taps to open our in-app image viewer instead of
	// navigating to the URL.
	const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)(\?|#|$)/i;
	const VIDEO_RE = /\.(mp4|webm|mov)(\?|#|$)/i;
	const REDDIT_MEDIA_HOSTS = /^https?:\/\/(i\.redd\.it|preview\.redd\.it|i\.imgur\.com|media\.giphy\.com|i\.giphy\.com|media\d*\.giphy\.com|media\.tenor\.com|c\.tenor\.com)/i;

	// Giphy share URLs (https://giphy.com/gifs/[slug-]<id>) don't end with an
	// image extension, but the direct CDN URL is derivable: take the last
	// hyphen-separated segment of the path and substitute into the media URL.
	function transformShareUrl(href: string): string | null {
		const giphy = href.match(/^https?:\/\/(?:www\.)?giphy\.com\/gifs\/([^/?#]+)/i);
		if (giphy) {
			const id = giphy[1].split('-').pop() ?? giphy[1];
			return `https://media.giphy.com/media/${id}/giphy.gif`;
		}
		return null;
	}

	function looksLikeImage(url: string): boolean {
		return IMAGE_RE.test(url) || REDDIT_MEDIA_HOSTS.test(url);
	}

	function inlineMedia(htmlString: string): string {
		if (typeof document === 'undefined') return htmlString;
		const tmp = document.createElement('div');
		tmp.innerHTML = htmlString;
		for (const a of Array.from(tmp.querySelectorAll('a'))) {
			const href = a.getAttribute('href') ?? '';
			if (!href) continue;
			if (a.querySelector('img, video')) continue; // already inlined

			const transformed = transformShareUrl(href);
			const mediaUrl = transformed ?? href;

			if (VIDEO_RE.test(mediaUrl)) {
				const v = document.createElement('video');
				v.src = mediaUrl;
				v.controls = true;
				v.playsInline = true;
				v.preload = 'metadata';
				v.dataset.viewerSrc = mediaUrl;
				v.dataset.viewerKind = 'video';
				a.textContent = '';
				a.appendChild(v);
			} else if (looksLikeImage(mediaUrl)) {
				const img = document.createElement('img');
				img.src = mediaUrl;
				img.alt = a.textContent ?? '';
				img.loading = 'lazy';
				img.referrerPolicy = 'no-referrer';
				img.dataset.viewerSrc = mediaUrl;
				img.dataset.viewerKind = 'image';
				a.textContent = '';
				a.appendChild(img);
			}
		}
		return tmp.innerHTML;
	}

	// Tap-anywhere-on-media: hand off to the in-app viewer instead of letting
	// the wrapping <a> navigate to Reddit / the original URL.
	function onClick(e: MouseEvent) {
		const t = e.target as HTMLElement;
		const media = t.closest('[data-viewer-src]') as HTMLElement | null;
		if (!media) return;
		e.preventDefault();
		e.stopPropagation();
		const src = media.dataset.viewerSrc!;
		const kind = media.dataset.viewerKind;
		const alt = (media as HTMLImageElement).alt;
		if (kind === 'video') openVideo(src, alt);
		else openImage(src, alt);
	}

	let safe = $derived.by(() => {
		const source = html ?? md ?? '';
		if (!source) return '';
		const cacheKey = (html !== undefined ? 'h:' : 'm:') + source;
		return cachedRender(cacheKey, () => {
			const raw = html ?? (marked.parse(md ?? '', { async: false }) as string);
			const sanitized = DOMPurify.sanitize(raw, {
				ALLOWED_TAGS: [
					'a',
					'p',
					'br',
					'em',
					'strong',
					'i',
					'b',
					'u',
					's',
					'del',
					'ins',
					'sup',
					'sub',
					'code',
					'pre',
					'blockquote',
					'ul',
					'ol',
					'li',
					'h1',
					'h2',
					'h3',
					'h4',
					'h5',
					'h6',
					'hr',
					'table',
					'thead',
					'tbody',
					'tr',
					'th',
					'td',
					'div',
					'span',
					'img',
					'video'
				],
				ALLOWED_ATTR: [
					'href',
					'title',
					'src',
					'alt',
					'rel',
					'target',
					'controls',
					'playsinline',
					'preload',
					'loading',
					'referrerpolicy'
				]
			});
			return inlineMedia(sanitized);
		});
	});
</script>

<div class="md" onclick={onClick} role="presentation">
	{@html safe}
</div>

<style>
	.md {
		font-size: 14px;
		line-height: 1.5;
		color: var(--md-sys-color-on-surface);
		word-break: break-word;
	}
	.md :global(a) {
		color: var(--md-sys-color-primary);
		text-decoration: underline;
	}
	.md :global(p) {
		margin: 0 0 0.75em;
	}
	.md :global(p:last-child) {
		margin-bottom: 0;
	}
	.md :global(blockquote) {
		margin: 0 0 0.75em;
		padding: 4px 12px;
		border-left: 3px solid var(--md-sys-color-outline-variant);
		color: var(--md-sys-color-on-surface-variant);
	}
	.md :global(code) {
		padding: 1px 4px;
		background: var(--md-sys-color-surface-container-high);
		border-radius: 4px;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.9em;
	}
	.md :global(pre) {
		padding: 8px 12px;
		background: var(--md-sys-color-surface-container-high);
		border-radius: 8px;
		overflow-x: auto;
	}
	.md :global(pre code) {
		padding: 0;
		background: transparent;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0 0 0.75em;
		padding-left: 1.5em;
	}
	.md :global(img),
	.md :global(video) {
		display: block;
		max-width: 100%;
		max-height: 60vh;
		height: auto;
		border-radius: 8px;
		margin: 4px 0;
		background: var(--md-sys-color-surface-container-low);
	}
	.md :global(table) {
		border-collapse: collapse;
	}
	.md :global(th),
	.md :global(td) {
		padding: 4px 8px;
		border: 1px solid var(--md-sys-color-outline-variant);
	}
</style>
