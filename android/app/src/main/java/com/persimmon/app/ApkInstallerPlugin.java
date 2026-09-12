package com.persimmon.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Hands a downloaded APK to Android's package installer.
 *
 * Persimmon is sideloaded, so there is no store to push updates. The JS side
 * downloads the release APK to the cache directory and calls install(); this
 * plugin wraps it in a FileProvider content:// URI (a raw file:// URI throws
 * FileUriExposedException on API 24+) and fires the system installer.
 *
 * What this deliberately does NOT do is install silently — Android only allows
 * that for device-owner or privileged system apps. The user always sees the
 * platform's own confirmation dialog. All we remove is the detour through a
 * browser, the release page, and the Downloads folder.
 *
 * Two gates before the intent will work:
 *   - REQUEST_INSTALL_PACKAGES in the manifest (compile-time), and
 *   - on API 26+, the user granting "install unknown apps" for Persimmon.
 * canInstall() reports the second; openInstallSettings() takes them there.
 * Callers fall back to opening the release page in a browser if it's refused.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasInstallPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // Pre-Oreo there is no per-app source setting; the manifest
            // permission alone is enough.
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open the install-permission screen", e);
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Missing APK path");
            return;
        }

        if (!hasInstallPermission()) {
            call.reject("PERMISSION_DENIED");
            return;
        }

        File apk = new File(normalize(path));
        if (!apk.exists() || apk.length() == 0) {
            call.reject("Downloaded APK is missing or empty");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            // GRANT_READ lets the installer read our private cache file;
            // NEW_TASK because we start it from the plugin's context.
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't launch the installer", e);
        }
    }

    private boolean hasInstallPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Filesystem.downloadFile() may hand back either a bare path or a file:// URI. */
    private String normalize(String path) {
        if (!path.startsWith("file://")) return path;
        String parsed = Uri.parse(path).getPath();
        return parsed != null ? parsed : path.substring("file://".length());
    }
}
