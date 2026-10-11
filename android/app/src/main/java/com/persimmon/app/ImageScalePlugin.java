package com.persimmon.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Makes a copy of a very large image that is small enough for the WebView to
 * show, for zooming in the image viewer.
 *
 * Phone cameras now post 48 megapixel originals. Decoded, one of those is
 * close to 200 MB, and the WebView refuses to decode it (or the renderer is
 * killed trying). Reddit only offers renditions up to 1080 px wide, which is
 * blurry at 3x zoom, so there is nothing in between to ask for.
 *
 * BitmapFactory can decode straight to a fraction of the size without ever
 * holding the full picture in memory, which the web side has no way to do.
 * The web side downloads the original to the cache directory and hands the
 * path here; the reduced copy is written next to it.
 */
@CapacitorPlugin(name = "ImageScale")
public class ImageScalePlugin extends Plugin {

    private static final long STALE_MS = 24L * 60 * 60 * 1000;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        // Downloads made for zooming, copying and sharing all land in one
        // cache folder. Nothing in it is needed for long.
        worker.execute(() -> {
            File[] files = new File(getContext().getCacheDir(), "shared").listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - STALE_MS;
            for (File f : files) {
                if (f.isFile() && f.lastModified() < cutoff) f.delete();
            }
        });
    }

    @PluginMethod
    public void fit(PluginCall call) {
        String raw = call.getString("path");
        if (raw == null || raw.isEmpty()) {
            call.reject("Missing image path");
            return;
        }
        final int maxPixels = Math.max(1_000_000, call.getInt("maxPixels", 12_000_000));
        final boolean deleteSource = Boolean.TRUE.equals(call.getBoolean("deleteSource", false));
        String parsed = raw.startsWith("file://") ? Uri.parse(raw).getPath() : raw;
        final File source = new File(parsed != null ? parsed : raw);

        worker.execute(() -> {
            Bitmap bitmap = null;
            try {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(source.getPath(), bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                    call.reject("Not an image");
                    return;
                }
                // Halve until it fits. Powers of two are the steps the decoders
                // can take without first producing the full-size picture.
                int sample = 1;
                while ((long) (bounds.outWidth / sample) * (bounds.outHeight / sample) > maxPixels) {
                    sample *= 2;
                }
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = sample;
                bitmap = BitmapFactory.decodeFile(source.getPath(), options);
                if (bitmap == null) {
                    call.reject("Couldn't decode the image");
                    return;
                }

                boolean alpha = bitmap.hasAlpha();
                String name = source.getName();
                int dot = name.lastIndexOf('.');
                String base = dot > 0 ? name.substring(0, dot) : name;
                File out = new File(source.getParentFile(), "fit-" + base + (alpha ? ".png" : ".jpg"));
                try (FileOutputStream stream = new FileOutputStream(out)) {
                    bitmap.compress(alpha ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 92, stream);
                }

                JSObject result = new JSObject();
                result.put("path", out.getAbsolutePath());
                result.put("width", bitmap.getWidth());
                result.put("height", bitmap.getHeight());
                call.resolve(result);
            } catch (Throwable t) {
                // Throwable, not Exception: running out of memory is an Error.
                call.reject("Couldn't resize the image: " + t.getMessage());
            } finally {
                if (bitmap != null) bitmap.recycle();
                if (deleteSource) source.delete();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
    }
}
