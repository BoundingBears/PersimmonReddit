import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.persimmon.app',
	appName: 'Persimmon',
	webDir: 'build',
	android: {
		allowMixedContent: false,
		// Dark WebView background so there's no white flash between the splash and
		// the SPA's first paint.
		backgroundColor: '#141218'
	},
	server: {
		androidScheme: 'https'
	},
	plugins: {
		SplashScreen: {
			// Go straight into the app: don't hold the plugin splash at all (the
			// app also calls SplashScreen.hide() once the shell paints). The brief
			// OS launch screen is now dark (styles.xml) so it blends into the dark
			// app instead of flashing orange. NOTE: if iOS is revived, it may want
			// a small non-zero duration to cover its slower WebView cold-start.
			launchShowDuration: 0,
			launchAutoHide: true,
			backgroundColor: '#141218',
			showSpinner: false
		},
		StatusBar: {
			style: 'DARK',
			backgroundColor: '#141218'
		}
	}
};

export default config;
