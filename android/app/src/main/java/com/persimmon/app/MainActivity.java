package com.persimmon.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.getcapacitor.BridgeActivity;

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

    private static final Pattern URL_RE = Pattern.compile("https?://\\S+");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugin that fetches Reddit JSON through a real WebView — Reddit
        // now blocks the native okhttp client. Must register before super.
        registerPlugin(RedditFetchPlugin.class);
        // Rewrite before super reads the intent for the cold-start launch URL.
        convertSendToView(getIntent());
        super.onCreate(savedInstanceState);
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
