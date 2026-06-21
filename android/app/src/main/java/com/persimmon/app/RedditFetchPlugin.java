package com.persimmon.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
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
	private static final String UA =
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

	private final Handler main = new Handler(Looper.getMainLooper());
	private final Semaphore slots = new Semaphore(MAX_CONCURRENT);

	private WebView warmupWv;
	private boolean warmedUp = false;
	private final List<Runnable> pendingWarmup = new ArrayList<>();

	// Populate the (process-global) WebView cookie jar with Reddit's anonymous
	// session cookies via a single real navigation. Once warm, plain okhttp
	// requests (which share the cookie jar) are accepted too. Resolves when warm.
	@PluginMethod
	public void warmup(final PluginCall call) {
		main.post(() -> {
			ensureWarmup();
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
		if (warmupWv != null) return;
		CookieManager.getInstance().setAcceptCookie(true);
		warmupWv = newWebView();
		CookieManager.getInstance().setAcceptThirdPartyCookies(warmupWv, true);
		warmupWv.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageFinished(WebView view, String pageUrl) {
				markWarm();
			}

			@Override
			public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
				if (request.isForMainFrame()) markWarm();
			}
		});
		// Don't wait forever for a slow homepage — proceed (cookies may be partial).
		main.postDelayed(this::markWarm, WARMUP_TIMEOUT_MS);
		warmupWv.loadUrl(WARMUP_URL);
		// The cookies we need land with the first response, long before the heavy
		// homepage finishes rendering — so poll for them and proceed as soon as
		// they're set, rather than waiting on onPageFinished.
		final Runnable[] poll = new Runnable[1];
		poll[0] = () -> {
			if (warmedUp) return;
			String c = CookieManager.getInstance().getCookie(WARMUP_URL);
			if (c != null && !c.isEmpty()) {
				markWarm();
			} else {
				main.postDelayed(poll[0], 150);
			}
		};
		main.postDelayed(poll[0], 150);
	}

	private void markWarm() {
		if (warmedUp) return;
		warmedUp = true;
		for (Runnable r : pendingWarmup) main.post(r);
		pendingWarmup.clear();
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
