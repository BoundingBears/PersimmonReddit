# 🍊 Persimmon

> *A read-only Reddit client for Android, made with care, Material 3, and absolutely zero login walls.* ✨

🌸 Persimmon believes scrolling should feel nice. No ads, no tracking, no analytics, no account required, no API key, no nonsense. Just feeds, posts, comments, and a little bit of softness.

---

## 🎀 Meet Persimmon-chan

Persimmon-chan is the (currently imaginary) friendly face of this little garden — a cheerful seasonal sprite themed around the persimmon fruit: warm orange-red, leafy green hair, a quiet sense of mischief, probably carrying a tiny basket of fruit.

**She doesn't exist yet.** We need someone to draw her! See [🎨 Help Wanted](#-help-wanted) below if you want to be the artist who brings her to life — you'd be the very first community contributor and you'd ship in the next release. 💕

---

## ✨ Features

- 🎨 **Material 3 UI** — light / dark / AMOLED themes with a custom accent picker
- 📐 **Three feed layouts** — card, compact, gallery — switchable from settings
- 🍊 **Subscribed feed** that merges all your bookmarked subreddits into one tidy round-robin'd timeline (no Reddit account, no OAuth — bookmarks live on your device)
- 🔄 **Pull to refresh** on every feed, with a proper indicator and gesture haptics
- 🖼️ **In-app image / video lightbox** with save & share buttons. Tapping a media link in a comment opens it inline; back gesture closes the viewer without leaving the post
- 💫 **Smart navigation** — iOS-style page transitions, scroll-position restoration when you back-gesture out of a post, bottom-tab spam doesn't pollute history
- 🌱 **No bullshit** — public Reddit JSON feeds, no telemetry, never any ads

## 🌿 Read-only — by design

Persimmon does not log into Reddit. It cannot vote, comment, post, save, or subscribe on Reddit's side. "Subscribed" subreddits are stored locally on your device and used to build a personal merged feed via Reddit's standard public per-subreddit endpoints.

If Reddit's authenticated features are something you need, this isn't the app for you. 💛

## 📦 Install

Pre-built APKs live on the [Releases page](https://github.com/BoundingBears/PersimmonReddit/releases). Download the latest `.apk`, sideload, done.

To build from source, see [🌱 Development](#-development) below.

## 🛠️ Stack

- 💚 [SvelteKit](https://svelte.dev/) (SPA mode via `@sveltejs/adapter-static`) + TypeScript
- ⚡ [Capacitor 8](https://capacitorjs.com/) for the Android wrapper
- 🎬 [hls.js](https://github.com/video-dev/hls.js) (lazy-loaded) for v.redd.it streams
- 📝 [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify) for comment / selftext rendering
- 🔣 Material Symbols (web font) for icons
- 🍊 A thin typed wrapper around Reddit's public `/<thing>.json` endpoints — proper User-Agent, 429 retry, old.reddit.com fallback, per-shape parsers ([`src/lib/reddit/`](src/lib/reddit/))

## 🌱 Development

### Prerequisites

- Node.js 22+
- Android Studio (only for the device install step — the SPA itself builds with just Node)
- A Java 17+ JDK (Android Studio's bundled JBR works fine)

### Setup

```sh
git clone https://github.com/BoundingBears/PersimmonReddit.git
cd PersimmonReddit
npm install
```

If your default `JAVA_HOME` is < 17 (AGP 8 requires JDK 17+), pin Studio's bundled JBR in your **user-level** Gradle config — `~/.gradle/gradle.properties` (create if it doesn't exist). This file is per-user, lives outside any project, and never gets committed:

```properties
# macOS
org.gradle.java.home=/Applications/Android Studio.app/Contents/jbr/Contents/Home

# Linux (path varies by install method)
# org.gradle.java.home=/usr/lib/jvm/java-21-openjdk

# Windows
# org.gradle.java.home=C\:\\Program Files\\Android\\Android Studio\\jbr
```

### ⚡ Web dev loop

```sh
npm run dev
```

Open `http://localhost:5173`, use Chrome's device toolbar at phone width. The Reddit data layer talks to www.reddit.com directly (CORS works for unauthenticated JSON).

### 📱 On-device install

Plug in an Android phone with USB debugging enabled, or boot an emulator from Android Studio's Device Manager. Then:

```sh
npm run install:android
```

That runs `vite build` → `npx cap sync android` → `./gradlew installDebug`. The APK lands on the device as **Persimmon**. 🍊

### 🧪 Tests

```sh
npm run test
```

Vitest exercises the parser layer against captured Reddit fixtures in [`src/lib/reddit/__fixtures__/`](src/lib/reddit/__fixtures__/). 28 tests covering text posts, image posts, galleries, v.redd.it videos, crossposts, NSFW handling, deleted comments, and "more" stubs.

### 🔍 Type-check

```sh
npm run check
```

## 🎨 Help wanted!

Persimmon is a one-person project that would *love* some friends. If any of these is your jam, please open an issue or PR — you'd be making a real difference!

### 🌸 Persimmon-chan artist *(highest priority — please come help!)*

We need an artist to bring **Persimmon-chan** to life! She's the (currently imaginary) community mascot. Vibe-wise: a young, cheerful sprite associated with the persimmon fruit — orange-red palette, green leafy elements, friendly and a little bit magical. Anime-adjacent style is welcome but not required; cute pixel art, watercolor, flat illustration — all interesting.

- 📐 **Format:** SVG ideal (we can use her in-app and she'll scale forever), but PNG illustrations are equally welcome
- 🎨 **Reference:** there isn't one yet — your interpretation **is** the canon. Have fun with it.
- 💌 **How:** open an issue with sketches, or jump straight to a PR with art in `assets/persimmon-chan/`
- 🏆 **Reward:** you'd be the first community contributor to ship in this project. Permanent shoutout in the README and in the app's About page. Plus eternal gratitude. 💕

### 🖼️ App icon designer

The current launcher icon is two-tone diagonal stripes (functional, but it's not *her*). If you do flat vector icon work and want to give Persimmon a more on-brand launcher icon — especially one that reads cleanly at 48dp — please open an issue or PR with some sketches!

The current foreground source is at [`assets/icon-foreground.svg`](assets/icon-foreground.svg). An older more-realistic fruit version is preserved at [`assets/icon-only-fruit.svg`](assets/icon-only-fruit.svg) for reference.

### 🐛 Bugs, features, ideas

Open an issue. Anything from "I wish there was a button for X" to "the comment renderer breaks on this specific post" is welcome.

## 💕 Support the project

If Persimmon makes your scrolling a little more pleasant and you'd like to leave a tip — no pressure, never paywalled, never ad-supported, and never on a "tier" that gates features:

[☕ **ko-fi.com/boundingbears**](https://ko-fi.com/boundingbears)

Donations help support continued development and (some day soon, with your help!) the official birth of Persimmon-chan. 🌸

## 📜 License

[MIT](LICENSE).

Persimmon is not affiliated with, endorsed by, or sponsored by Reddit, Inc. It uses Reddit's publicly-accessible JSON feeds for personal, non-commercial use. The "Reddit" name and logo are trademarks of Reddit, Inc.

---

<p align="center">🍊✨ Thanks for stopping by! ✨🍊</p>
