package com.persimmon.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.verify.domain.DomainVerificationManager;
import android.content.pm.verify.domain.DomainVerificationUserState;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;

/**
 * Reports whether Android will send reddit.com links to Persimmon, and opens
 * the system screen where the user turns that on.
 *
 * The manifest declares Persimmon as a handler for Reddit's hosts, but since
 * Android 12 a declaration is not enough. A web link only reaches an app if the
 * site has verified it (Digital Asset Links, which needs a file hosted on
 * reddit.com, so never) or the user has added the links by hand under
 * App info, Open by default. Until then browsers do not even offer the app,
 * and a Reddit link found through Google stays in the browser.
 *
 * An app cannot grant itself this. What it can do is say so, and take the user
 * to the exact screen, which is all this plugin is for.
 */
@CapacitorPlugin(name = "AppLinks")
public class AppLinksPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // Android 11 and older: unverified handlers still appear in the
            // "Open with" chooser, so there is nothing to switch on.
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        try {
            DomainVerificationManager manager = getContext().getSystemService(DomainVerificationManager.class);
            DomainVerificationUserState state =
                manager.getDomainVerificationUserState(getContext().getPackageName());
            int total = 0;
            int enabled = 0;
            if (state != null) {
                for (Map.Entry<String, Integer> e : state.getHostToStateMap().entrySet()) {
                    total++;
                    if (e.getValue() != DomainVerificationUserState.DOMAIN_STATE_NONE) enabled++;
                }
            }
            ret.put("supported", true);
            // The master "Open supported links" switch on the same screen.
            ret.put("allowed", state != null && state.isLinkHandlingAllowed());
            ret.put("total", total);
            ret.put("enabled", enabled);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Couldn't read link settings", e);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        final Uri pkg = Uri.parse("package:" + getContext().getPackageName());
        Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? new Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, pkg)
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException first) {
            // Some vendor builds drop the dedicated screen. App info always exists.
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e) {
                call.reject("Couldn't open link settings", e);
            }
        }
    }
}
