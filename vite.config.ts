import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		// An OAuth client ID Reddit has issued to this app, and the Reddit
		// username answerable for it. Both empty until that exists, which keeps
		// the OAuth transport off (src/lib/reddit/oauth.ts). Set them in the
		// environment for a build: REDDIT_CLIENT_ID=... REDDIT_APP_OWNER=...
		__REDDIT_CLIENT_ID__: JSON.stringify(process.env.REDDIT_CLIENT_ID ?? ''),
		__REDDIT_APP_OWNER__: JSON.stringify(process.env.REDDIT_APP_OWNER ?? '')
	}
});
