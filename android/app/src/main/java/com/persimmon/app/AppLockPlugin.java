package com.persimmon.app;

import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The lock on the private folder, or on the whole app if the user chooses.
 *
 * Unlocking is Android's own prompt: a fingerprint or face if one is enrolled,
 * otherwise (or on "use PIN") the phone's screen lock. There is no separate
 * app password to set, forget, or store.
 *
 * This is a privacy screen, not a vault: it stops someone holding the unlocked
 * phone from opening the folder. The content is not encrypted beyond what
 * Android already does for an app's private files.
 *
 * It also sets FLAG_SECURE while private content is showing, so that content
 * stays out of screenshots and the recents thumbnail. Only then: the rest of
 * the app is left alone, because the owner selects images out of the recents
 * screen.
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    // Weak biometrics are enough for a privacy screen, and this combination is
    // the one that works on every supported Android version.
    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int status = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject result = new JSObject();
        // False means the phone has no screen lock at all.
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        final String title = call.getString("title", "Unlock Persimmon");
        final String subtitle = call.getString("subtitle");
        final AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                        activity,
                        ContextCompat.getMainExecutor(activity),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                call.resolve();
                            }

                            @Override
                            public void onAuthenticationError(int code, @NonNull CharSequence message) {
                                // Cancelled, timed out, or locked out. A finger that simply
                                // did not match is onAuthenticationFailed, and the prompt
                                // stays up for another try.
                                call.reject(message.toString(), String.valueOf(code));
                            }
                        });
                BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setAllowedAuthenticators(AUTHENTICATORS);
                if (subtitle != null && !subtitle.isEmpty()) info.setSubtitle(subtitle);
                prompt.authenticate(info.build());
            } catch (Exception e) {
                call.reject("Couldn't show the unlock prompt", e);
            }
        });
    }

    /**
     * The page's scroll bar is drawn by the Android view, on top of whatever
     * the page shows, including the launch animation and the lock screen.
     * MainActivity starts with it off; the page turns it on when nothing is
     * covering the app and off again when something is.
     */
    @PluginMethod
    public void setScrollIndicator(PluginCall call) {
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().setVerticalScrollBarEnabled(visible);
            call.resolve();
        });
    }

    @PluginMethod
    public void setSecure(PluginCall call) {
        final boolean secure = Boolean.TRUE.equals(call.getBoolean("secure", false));
        getActivity().runOnUiThread(() -> {
            if (secure) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }
}
