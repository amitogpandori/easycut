package com.amitoj.easycut;

import androidx.core.content.FileProvider;

/** Shares only the downloaded update APK (cache/updates) with Android's installer. Separate from Capacitor's own provider. */
public class UpdateFileProvider extends FileProvider {
}
