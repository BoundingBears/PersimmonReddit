// A custom hls.js loader that fetches HLS playlists + segments through
// CapacitorHttp (native okhttp) instead of the WebView's fetch/XHR.
//
// Why: v.redd.it HLS requests are cross-origin from the app's localhost origin,
// so the WebView's loader hits the same CORS wall that blocked our JSON ("failed
// to fetch"). okhttp has no CORS and shares the warmed Reddit cookies, so video
// streams the same way the feed does now. Web/dev keeps hls.js's default loader.

import { CapacitorHttp } from '@capacitor/core';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// Loosely typed against hls.js's Loader interface — the shapes vary across
// versions, so we duck-type the handful of fields hls.js actually reads.
/* eslint-disable @typescript-eslint/no-explicit-any */
export class CapacitorHlsLoader {
	context: any;
	stats: any;
	private aborted = false;

	constructor(_config: any) {
		this.stats = {
			aborted: false,
			loaded: 0,
			retry: 0,
			total: 0,
			chunkCount: 0,
			bwEstimate: 0,
			loading: { start: 0, first: 0, end: 0 },
			parsing: { start: 0, end: 0 },
			buffering: { start: 0, first: 0, end: 0 }
		};
	}

	load(context: any, _config: any, callbacks: any): void {
		this.context = context;
		const wantsBinary = context.responseType === 'arraybuffer';
		this.stats.loading.start = now();

		// v.redd.it rejects hot-linking without a reddit Referer (same as i.redd.it
		// / preview.redd.it for images).
		const headers: Record<string, string> = { Referer: 'https://www.reddit.com/' };
		if (context.rangeStart != null || context.rangeEnd != null) {
			const start = context.rangeStart || 0;
			const end = context.rangeEnd != null ? context.rangeEnd - 1 : '';
			headers.Range = `bytes=${start}-${end}`;
		}

		CapacitorHttp.get({
			url: context.url,
			headers,
			responseType: wantsBinary ? 'arraybuffer' : 'text'
		})
			.then((res) => {
				if (this.aborted) return;
				const t = now();
				this.stats.loading.first = t;
				this.stats.loading.end = t;
				if (res.status < 200 || res.status >= 300) {
					callbacks.onError({ code: res.status, text: `HTTP ${res.status}` }, context, res, this.stats);
					return;
				}
				let data: string | ArrayBuffer;
				if (wantsBinary) {
					data = typeof res.data === 'string' ? base64ToArrayBuffer(res.data) : res.data;
					this.stats.loaded = this.stats.total = (data as ArrayBuffer).byteLength;
				} else {
					data = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
					this.stats.loaded = this.stats.total = (data as string).length;
				}
				callbacks.onSuccess({ url: context.url, data }, this.stats, context, res);
			})
			.catch((err) => {
				if (this.aborted) return;
				callbacks.onError({ code: 0, text: err?.message ?? String(err) }, context, null, this.stats);
			});
	}

	abort(): void {
		this.aborted = true;
		this.stats.aborted = true;
	}

	destroy(): void {
		this.aborted = true;
	}
}
