// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			// A post open in the layer over the current page. See postLayer.ts.
			postId?: string;
		}
		// interface Platform {}
	}

	const __APP_VERSION__: string;
	const __REDDIT_CLIENT_ID__: string;
	const __REDDIT_APP_OWNER__: string;
}

export {};
