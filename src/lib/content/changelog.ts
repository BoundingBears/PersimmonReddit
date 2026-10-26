// Release notes shown in the "What's New" sheet after an update. Newest first.
// Hand-authored. The sheet shows the newest entry and tucks the rest behind
// "Earlier versions", so keep each entry to at most three short bullets: a
// headline a user would notice, not a log of what changed.

export interface ChangelogEntry {
	version: string;
	items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.5.2',
		items: [
			'💬 More comments per post, and replies when you tap More replies',
			'▶️ Videos play again, right in the feed too, and search works again',
			'⚡ Faster loading, and your subscriptions feed no longer trips Reddit\'s limits'
		]
	},
	{
		version: '1.5.1',
		items: [
			'🚧 Subreddits and comments that Reddit refuses now load another way, and failures are explained in plain words',
			'↩️ Back returns to exactly where you were, even if the feed changed underneath',
			'💬 Snackbars are all the same bar now, and you can swipe them away'
		]
	},
	{
		version: '1.5.0',
		items: [
			'⚡ Posts open instantly, Back returns to your spot, and the app reopens where you left off',
			'🖼️ New image viewer, and YouTube, Twitch and Streamable play inside posts',
			'🔖 Saved posts work offline, with a private folder you can lock, plus new themes and a new icon'
		]
	},
	{
		version: '1.3.4',
		items: ['🚫 Block users from a post or their profile', '↕️ Drag to reorder your subscribed subs']
	},
	{
		version: '1.3.3',
		items: [
			'⬇️ One-tap updates, installed from inside the app',
			'⚙️ Settings rebuilt, with Undo on every clear',
			'↩️ Back always returns to the feed'
		]
	},
	{
		version: '1.3.2',
		items: ['↩️ Back keeps your place in every feed', '📌 The feed no longer jumps to the top by itself']
	},
	{
		version: '1.3.1',
		items: [
			'🎬 Videos start almost instantly',
			'🖼️ Fullscreen image viewer with pinch to zoom',
			'💾 Automatic backup to your Documents folder'
		]
	},
	{
		version: '1.2',
		items: ['📰 Redesigned post view', '🗂️ Custom feeds from the side drawer', '♾️ Smoother endless scroll']
	},
	{
		version: '1.1',
		items: ['🗂️ Feed groups', '🔀 Per-subreddit sort memory', '🔤 Text size slider']
	}
];
