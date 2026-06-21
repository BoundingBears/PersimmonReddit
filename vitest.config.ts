import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		// Map $lib so tests can import it (this config doesn't load the SvelteKit
		// plugin, which is what normally provides the alias). Without this,
		// parsers.ts -> $lib/utils/platform fails to resolve under vitest.
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
