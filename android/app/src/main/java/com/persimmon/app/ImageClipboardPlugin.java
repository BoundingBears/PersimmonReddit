package com.persimmon.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Puts an image FILE on the system clipboard, so it can be pasted into a chat
 * or an editor as a picture rather than as a link.
 *
 * The web clipboard API cannot do this inside an Android WebView: writing an
 * image needs a content provider to serve it to the pasting app, and WebView
 * does not ship one the way Chrome does. So the web side downloads the image
 * to the cache directory and hands the path here; we wrap it in a FileProvider
 * content:// URI. The system grants the pasting app read access to that URI at
 * paste time.
 */
@CapacitorPlugin(name = "ImageClipboard")
public class ImageClipboardPlugin extends Plugin {

    @PluginMethod
    public void copy(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Missing image path");
            return;
        }
        if (path.startsWith("file://")) {
            String parsed = Uri.parse(path).getPath();
            path = parsed != null ? parsed : path.substring("file://".length());
        }
        File image = new File(path);
        if (!image.exists() || image.length() == 0) {
            call.reject("Image file is missing or empty");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    image
            );
            ClipboardManager clipboard =
                    (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newUri(getContext().getContentResolver(), "Image", uri));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't copy the image", e);
        }
    }
}
