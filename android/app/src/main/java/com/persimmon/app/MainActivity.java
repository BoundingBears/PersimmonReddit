package com.persimmon.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Persimmon's only native activity.
 *
 * Capacitor already turns an incoming VIEW intent (someone taps a reddit.com
 * link in another app) into a JS `appUrlOpen` event that installDeepLinks.ts
 * routes. The system share sheet, though, sends ACTION_SEND with the URL tucked
 * in EXTRA_TEXT — a shape Capacitor doesn't forward. So before Capacitor looks
 * at the intent, we rewrite a "Share to Persimmon" SEND into an equivalent VIEW
 * intent. From there the existing deep-link path handles it, no plugin needed.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "Persimmon";
    private static final Pattern URL_RE = Pattern.compile("https?://\\S+");

    // elapsedRealtime of the last renderer recovery. Static so it survives the
    // activity being recreated, which is exactly when we need to consult it.
    private static long lastRendererRecovery = 0;
    private static final long RECOVERY_LOOP_WINDOW_MS = 10_000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugin that fetches Reddit JSON through a real WebView — Reddit
        // now blocks the native okhttp client. Must register before super.
        registerPlugin(RedditFetchPlugin.class);
        // Hands a downloaded release APK to the system package installer so the
        // in-app updater doesn't have to detour through a browser.
        registerPlugin(ApkInstallerPlugin.class);
        // Reports and opens Android's "open Reddit links in this app" setting.
        registerPlugin(AppLinksPlugin.class);
        // Puts an image file on the clipboard, which the WebView cannot do itself.
        registerPlugin(ImageClipboardPlugin.class);
        // Reduces oversized originals so the image viewer can zoom into them.
        registerPlugin(ImageScalePlugin.class);
        // Fingerprint / screen-lock prompt, and hiding private content from
        // screenshots and the recents screen.
        registerPlugin(AppLockPlugin.class);
        // Rewrite before super reads the intent for the cold-start launch URL.
        convertSendToView(getIntent());
        super.onCreate(savedInstanceState);
        // Android draws the page's scroll bar itself, over everything the page
        // shows, and flashes it whenever the page's height changes: all through
        // the launch animation, as a grey bar down the right edge. Start with
        // it off. The page turns it on once the app is actually on screen
        // (AppLockPlugin.setScrollIndicator).
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        installRendererRecovery();
    }

    /**
     * Survive the WebView's renderer process going away.
     *
     * Android reclaims the renderer of a backgrounded or screen-off app under
     * memory pressure as a matter of routine. Capacitor's default answer to
     * onRenderProcessGone is "not handled", and Chromium's response to that is
     * to kill the whole app ("Render process's crash wasn't handled by all
     * associated webviews, triggering application crash"). The user then came
     * back to a cold start on a brand new front page with their place lost.
     *
     * A WebView whose renderer is gone cannot be revived, so we rebuild the
     * activity around a fresh one. The web side persists the session (back
     * stack, feed posts, scroll anchor) and restores it on that reload, see
     * src/lib/stores/session.ts.
     */
    private void installRendererRecovery() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long now = SystemClock.elapsedRealtime();
                Log.w(TAG, "renderer gone (crashed=" + detail.didCrash() + ")");
                // A callback for an activity that is already on its way out has
                // nothing to recover. It still has to answer "handled".
                if (isFinishing() || isDestroyed()) return true;
                // A renderer that dies again straight after a recovery is a crash
                // loop, not memory pressure. Let the app die rather than spin.
                if (lastRendererRecovery != 0 && now - lastRendererRecovery < RECOVERY_LOOP_WINDOW_MS) {
                    Log.e(TAG, "renderer died again within the loop window, not recovering");
                    return false;
                }
                lastRendererRecovery = now;
                // Drop the launch link first: this is a recovery, not a fresh
                // launch, and the web side treats a launch URL as "go there".
                if (getIntent() != null) getIntent().setData(null);
                recreate();
                return true;
            }
        });
    }

    @Override
    public void onDestroy() {
        final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        super.onDestroy();
        // Capacitor destroys its WebView in onDetachedFromWindow, and a relaunch
        // (our renderer recovery calls recreate()) preserves the window, so that
        // never runs. The old WebView then stayed alive and attached to the
        // shared renderer: the next renderer loss notified it too, and its stale
        // listener's answer killed the app. Destroy it here, unconditionally.
        // A second destroy() from Capacitor's own path is a harmless no-op.
        if (wv != null) {
            if (wv.getParent() instanceof ViewGroup) ((ViewGroup) wv.getParent()).removeView(wv);
            wv.destroy();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Some devices come back from the lock screen or the recents list with
        // the WebView showing only its background colour until the first touch.
        // Ask for a fresh frame as soon as we are visible again.
        if (getBridge() != null && getBridge().getWebView() != null) {
            final WebView wv = getBridge().getWebView();
            wv.post(() -> {
                wv.invalidate();
                wv.requestLayout();
            });
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        // Warm start — app already running when the share happens.
        convertSendToView(intent);
        super.onNewIntent(intent);
    }

    private void convertSendToView(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;

        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        String url = firstUrl(shared);
        if (url == null) return;

        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(url));
    }

    private String firstUrl(String text) {
        if (text == null) return null;
        Matcher m = URL_RE.matcher(text);
        return m.find() ? m.group() : null;
    }
}
