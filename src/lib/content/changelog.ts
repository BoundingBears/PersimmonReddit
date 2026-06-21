// Release notes shown in the "What's New" sheet after an update. Newest first.
// Hand-authored — edit freely. The sheet appears once when the installed app
// version differs from prefs.lastSeenVersion (see whatsNew.ts).

export interface ChangelogEntry {
	version: string;
	title?: string;
	items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.2',
		title: 'Cleaner posts, custom feeds & a smoother feed',
		items: [
			'📰 Redesigned post view — a title-first layout with one tidy byline, so the top of every post is far less cluttered.',
			'🎬 Uniform video sizing — videos fit the screen without scrolling, and the vote/comment bar stays in view.',
			'📝 Body text now shows on image and video posts (it used to be hidden).',
			'🗂️ Custom feeds, redone — create and edit them right from the side drawer: tap +, name it, then tick the subreddits to include. No more digging through Settings.',
			'♾️ Smoother feed — fixed endless-scroll stalling, posts stream in as they load, and you get a clear “end of feed” marker (with a retry when the signal’s weak).'
		]
	},
	{
		version: '1.1',
		title: 'Groups, sort memory & a sturdier connection',
		items: [
			'🗂️ Feed groups — bundle your subscribed subreddits into named groups, each with its own merged feed and sort.',
			'🔀 Per-subreddit sort memory — every subreddit remembers how you last sorted it.',
			'✅ Mark-all-read, plus an option to hide posts you’ve already opened.',
			'ℹ️ Subreddit info — tap the info icon on any subreddit for its description and rules.',
			'🔤 Larger text — a reading-size slider in Settings → Appearance.',
			'📶 Tougher Reddit connection — alternate identities when Reddit blocks us, and cached feeds so a flaky network still shows something.'
		]
	}
];
