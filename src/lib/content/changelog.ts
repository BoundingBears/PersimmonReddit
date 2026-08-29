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
		version: '1.3.2',
		title: 'Back button keeps your place',
		items: [
			'↩️ Going back from a post drops you exactly where you were — Persimmon now remembers which post you were looking at, not just how far down the page you’d scrolled, so late-loading images can’t nudge you onto a different post.',
			'🗂️ Subscribed and custom feeds keep their place too — they used to refetch and reshuffle every time you backed out of a post, landing you somewhere you’d never been. Profiles and search results now hold their position as well.',
			'👉 Swiping left and right between posts works — the gesture had been quietly doing nothing.',
			'📌 The feed no longer jumps to the top on its own after you change a setting or dismiss a banner.'
		]
	},
	{
		version: '1.3.1',
		title: 'Faster videos, a better image viewer & safer backups',
		items: [
			'🎬 Videos start almost instantly — they now stream and buffer as they play instead of downloading in full first.',
			'🖼️ Revamped image viewer — tap a gallery post to open it fullscreen, pinch to zoom, swipe left and right between images, and swipe up or down to dismiss.',
			'💾 Auto-backup — Persimmon keeps a current backup of your subs, saved posts, filters and settings in your Documents folder, so reinstalling can’t wipe them. Restore it any time from Settings → Backup → Import.',
			'♾️ Fixed the stuck “Loading…” — deep scrolling no longer freezes on a hung request, and pull-to-refresh always recovers.',
			'⚡ Icons load instantly — the icon font is bundled in the app now, so a weak signal no longer shows placeholder text where icons should be.',
			'🆕 Update notifications — Persimmon checks for new versions and shows a banner when one’s ready, with a tap to grab it.'
		]
	},
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
