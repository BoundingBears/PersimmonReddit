package com.persimmon.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * Fetches Reddit JSON through a real, COOKIE-WARMED WebView navigation — the only
 * request shape Reddit's edge accepts from the app in 2026.
 *
 * What we learned probing the wall:
 *   - native okhttp           -> 403 WAF HTML page (TLS fingerprint)
 *   - WebView cross-origin fetch -> CORS-rejected (no ACAO on block page)
 *   - WebView same-origin fetch  -> 403 (fetch() carries Sec-Fetch-Mode: cors;
 *                                   can't forge "navigate")
 *   - WebView navigation, cold   -> 403 (past the WAF, but no session cookies)
 * A real browser succeeds because it's a NAVIGATION *and* it carries Reddit's
 * anonymous session cookies (edgebucket, csv, …) from normal browsing.
 *
 * So: on first use we warm a persistent WebView by navigating it to reddit.com,
 * which populates the process-global WebView cookie jar. Then each request spins
 * up a hidden WebView, NAVIGATES it to the target .json URL (now with cookies),
 * and reads the rendered response text. A Semaphore caps concurrent WebViews.
 */
@CapacitorPlugin(name = "RedditFetch")
public class RedditFetchPlugin extends Plugin {

	private static final long TIMEOUT_MS = 20_000;
	private static final long WARMUP_TIMEOUT_MS = 12_000;
	private static final int MAX_CONCURRENT = 4;
	private static final String WARMUP_URL = "https://www.reddit.com/";
	private static final String BLANK_URL = "about:blank";
	// How long the warm-up page stays loaded after it has done its job. Long
	// enough for Reddit's JS challenge to finish setting cookies.
	private static final long RELEASE_DELAY_MS = 20_000;
	// A forced re-warm waits for navigation to go quiet for this long, because
	// the JS challenge finishes with a second page load.
	private static final long REWARM_SETTLE_MS = 1_500;
	private static final String UA =
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

	private final Handler main = new Handler(Looper.getMainLooper());
	private final Semaphore slots = new Semaphore(MAX_CONCURRENT);

	private WebView warmupWv;
	private boolean warmedUp = false;
	// True while a forced re-warm is running: the "a cookie exists" shortcut
	// does not apply (stale cookies already exist), we wait for the page.
	private boolean rewarming = false;
	private final List<Runnable> pendingWarmup = new ArrayList<>();
	private final Runnable releaseWarmupPage = () -> {
		// The homepage is a full web app (scripts, service worker). Left open it
		// sat in the same renderer process as Persimmon for the whole session,
		// about 35 MB that made the renderer a likelier target for the system's
		// low-memory killer. The cookies live in the CookieManager, not the page.
		if (warmupWv != null && !rewarming) warmupWv.loadUrl(BLANK_URL);
	};
	private final Runnable settleRewarm = this::markWarm;
	private final Runnable warmupTimeout = this::markWarm;

	// Populate the (process-global) WebView cookie jar with Reddit's anonymous
	// session cookies via a single real navigation. Once warm, plain okhttp
	// requests (which share the cookie jar) are accepted too. Resolves when warm.
	// `force: true` re-runs the warm-up even though cookies exist. Used when a
	// request comes back blocked mid-session: the cookies have lapsed or Reddit
	// wants its JS challenge solved again, and only a real page load does that.
	@PluginMethod
	public void warmup(final PluginCall call) {
		final boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
		main.post(() -> {
			if (force) {
				rewarm();
			} else {
				ensureWarmup();
			}
			if (warmedUp) {
				call.resolve();
			} else {
				pendingWarmup.add(call::resolve);
			}
		});
	}

	@PluginMethod
	public void get(final PluginCall call) {
		final String url = call.getString("url");
		if (url == null) {
			call.reject("missing url");
			return;
		}
		main.post(() -> {
			ensureWarmup();
			final Runnable proceed = () -> startNavigation(url, call);
			if (warmedUp) {
				proceed.run();
			} else {
				pendingWarmup.add(proceed);
			}
		});
	}

	@SuppressLint("SetJavaScriptEnabled")
	private void ensureWarmup() {
		if (warmedUp || warmupWv != null) return;
		CookieManager.getInstance().setAcceptCookie(true);
		// A returning user already has Reddit's cookies: the WebView cookie jar
		// persists across launches. Loading the whole reddit.com homepage again
		// on every start bought nothing and cost a lot. It ran alongside the
		// first feed request, which took 6.6 s on a cold start against 0.7 s
		// once that page had settled. If the saved cookies turn out stale, the
		// first request comes back blocked and client.ts forces a re-warm.
		final String existing = CookieManager.getInstance().getCookie(WARMUP_URL);
		if (existing != null && !existing.isEmpty()) {
			warmedUp = true;
			return;
		}
		createWarmupWebView();
		// Don't wait forever for a slow homepage: proceed (cookies may be partial).
		main.removeCallbacks(warmupTimeout);
		main.postDelayed(warmupTimeout, WARMUP_TIMEOUT_MS);
		warmupWv.loadUrl(WARMUP_URL);
		// The cookies we need land with the first response, long before the heavy
		// homepage finishes rendering, so poll for them and proceed as soon as
		// they're set rather than waiting on onPageFinished.
		final Runnable[] poll = new Runnable[1];
		poll[0] = () -> {
			if (warmedUp || rewarming) return;
			String c = CookieManager.getInstance().getCookie(WARMUP_URL);
			if (c != null && !c.isEmpty()) {
				markWarm();
			} else {
				main.postDelayed(poll[0], 150);
			}
		};
		main.postDelayed(poll[0], 150);
	}

	@SuppressLint("SetJavaScriptEnabled")
	private void createWarmupWebView() {
		warmupWv = newWebView();
		CookieManager.getInstance().setAcceptThirdPartyCookies(warmupWv, true);
		warmupWv.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageFinished(WebView view, String pageUrl) {
				if (BLANK_URL.equals(pageUrl)) return; // our own release, not a warm-up
				if (rewarming) {
					// Debounce: the challenge page finishes, then redirects to the
					// real page, which finishes again.
					main.removeCallbacks(settleRewarm);
					main.postDelayed(settleRewarm, REWARM_SETTLE_MS);
				} else {
					markWarm();
				}
			}

			@Override
			public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
				if (request.isForMainFrame()) markWarm();
			}

			@Override
			public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
				// Every WebView sharing the dead renderer must report it handled,
				// or Chromium kills the app regardless of what MainActivity says.
				Log.w("Persimmon", "renderer gone: warm-up webview " + System.identityHashCode(view));
				dropWarmupWebView();
				return true;
			}
		});
	}

	private void markWarm() {
		if (warmedUp) return;
		warmedUp = true;
		rewarming = false;
		main.removeCallbacks(settleRewarm);
		main.removeCallbacks(warmupTimeout);
		for (Runnable r : pendingWarmup) main.post(r);
		pendingWarmup.clear();
		main.removeCallbacks(releaseWarmupPage);
		main.postDelayed(releaseWarmupPage, RELEASE_DELAY_MS);
	}

	private void rewarm() {
		if (rewarming) return; // one already in flight; callers queue behind it
		// Always a real page load, even though cookies exist: they are the ones
		// that just got us blocked.
		if (warmupWv == null) createWarmupWebView();
		warmedUp = false;
		rewarming = true;
		main.removeCallbacks(releaseWarmupPage);
		main.removeCallbacks(warmupTimeout);
		main.postDelayed(warmupTimeout, WARMUP_TIMEOUT_MS);
		warmupWv.loadUrl(WARMUP_URL);
	}

	private void dropWarmupWebView() {
		main.removeCallbacks(releaseWarmupPage);
		main.removeCallbacks(settleRewarm);
		main.removeCallbacks(warmupTimeout);
		if (warmupWv != null) {
			final ViewGroup parent = (ViewGroup) warmupWv.getParent();
			if (parent != null) parent.removeView(warmupWv);
			warmupWv.destroy();
			warmupWv = null;
		}
		warmedUp = false;
		rewarming = false;
	}

	@Override
	protected void handleOnDestroy() {
		// The activity is going away (including our own renderer recovery, which
		// recreates it). Do not leave a WebView holding the old activity alive.
		dropWarmupWebView();
		super.handleOnDestroy();
	}

	private void startNavigation(final String url, final PluginCall call) {
		new Thread(() -> {
			try {
				slots.acquire();
			} catch (InterruptedException e) {
				call.reject("interrupted");
				return;
			}
			main.post(() -> navigate(url, call));
		}).start();
	}

	@SuppressLint("SetJavaScriptEnabled")
	private WebView newWebView() {
		final WebView wv = new WebView(getContext());
		wv.getSettings().setJavaScriptEnabled(true);
		wv.getSettings().setDomStorageEnabled(true);
		wv.getSettings().setUserAgentString(UA);
		wv.setLayoutParams(new ViewGroup.LayoutParams(1, 1));
		final ViewGroup root = getActivity().findViewById(android.R.id.content);
		if (root != null) {
			root.addView(wv);
			wv.setX(-3000);
			wv.setY(-3000);
		}
		return wv;
	}

	private void navigate(final String url, final PluginCall call) {
		final WebView wv = newWebView();
		final ViewGroup root = getActivity().findViewById(android.R.id.content);

		final boolean[] done = { false };
		final int[] status = { 200 };

		final Runnable finish = () -> {
			if (root != null) root.removeView(wv);
			wv.destroy();
			slots.release();
		};

		main.postDelayed(() -> {
			if (done[0]) return;
			done[0] = true;
			call.reject("timeout");
			finish.run();
		}, TIMEOUT_MS);

		wv.setDownloadListener((u, ua, cd, mime, len) -> {
			if (done[0]) return;
			done[0] = true;
			call.reject("download:" + mime);
			finish.run();
		});

		wv.setWebViewClient(new WebViewClient() {
			@Override
			public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
				if (request.isForMainFrame()) status[0] = errorResponse.getStatusCode();
			}

			@Override
			public void onPageFinished(WebView view, String pageUrl) {
				if (done[0]) return;
				view.evaluateJavascript("(document.body?document.body.innerText:'')", value -> {
					if (done[0]) return;
					done[0] = true;
					JSObject ret = new JSObject();
					ret.put("status", status[0]);
					ret.put("body", decode(value));
					// Where the navigation ended up after redirects. Lets the web
					// side resolve share links (reddit.com/r/x/s/...) to a post.
					ret.put("url", view.getUrl());
					call.resolve(ret);
					finish.run();
				});
			}

			@Override
			public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
				if (!request.isForMainFrame() || done[0]) return;
				done[0] = true;
				call.reject("navigation error");
				finish.run();
			}

			@Override
			public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
				// See the warm-up client: report handled, and fail this one request.
				Log.w("Persimmon", "renderer gone: request webview " + System.identityHashCode(view) + " done=" + done[0]);
				if (!done[0]) {
					done[0] = true;
					call.reject("renderer gone");
					finish.run();
				}
				return true;
			}
		});

		wv.loadUrl(url);
	}

	// evaluateJavascript hands back the result JSON-encoded (a quoted, escaped
	// string). Decode it back to the raw response text.
	private static String decode(String value) {
		if (value == null || value.equals("null")) return "";
		try {
			Object parsed = new org.json.JSONTokener(value).nextValue();
			return parsed == null ? "" : parsed.toString();
		} catch (Exception e) {
			return value;
		}
	}
}
