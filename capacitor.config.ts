import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.persimmon.app',
	appName: 'Persimmon',
	webDir: 'build',
	android: {
		allowMixedContent: false
	},
	server: {
		androidScheme: 'https'
	},
	plugins: {
		SplashScreen: {
			launchShowDuration: 600,
			backgroundColor: '#ED5D1F',
			showSpinner: false
		},
		StatusBar: {
			style: 'DARK',
			backgroundColor: '#ED5D1F'
		}
	}
};

export default config;
