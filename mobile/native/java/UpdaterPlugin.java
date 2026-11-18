package com.amitoj.easycut;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * EasyCut in-app updates: downloads the new APK from this app's GitHub releases and opens Android's installer.
 * Android always asks the user to confirm the install. The first time, it also needs "Allow from this source".
 */
@CapacitorPlugin(name = "EasyCutUpdater")
public class UpdaterPlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/amitogpandori/easycut/releases/";
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File updatesDir() {
        File d = new File(getContext().getCacheDir(), "updates");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    @SuppressWarnings("deprecation")
    private long codeOf(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionName", pi.versionName);
            r.put("versionCode", codeOf(pi));
            r.put("canInstall", canInstall());
            r.put("sdk", Build.VERSION.SDK_INT);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read app version: " + e.getMessage());
        }
    }

    /** Opens Settings → "Install unknown apps" → EasyCut, where the user turns on "Allow from this source". */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        String name = call.getString("fileName", "EasyCut-update.apk");
        if (url == null || !url.startsWith(ALLOWED) || !url.toLowerCase().endsWith(".apk")) { call.reject("Not an EasyCut release download"); return; }
        if (downloading) { call.reject("A download is already running"); return; }
        final String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
        downloading = true;
        exec.execute(() -> {
            File part = new File(updatesDir(), safe + ".part");
            File out = new File(updatesDir(), safe);
            try {
                File[] old = updatesDir().listFiles();
                if (old != null) for (File f : old) f.delete();
                String cur = url;
                HttpURLConnection c = null;
                for (int hop = 0; hop < 6; hop++) { // GitHub redirects to its file servers
                    c = (HttpURLConnection) new URL(cur).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "EasyCut-Android");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect();
                        if (loc == null || !loc.startsWith("https://")) throw new Exception("Bad redirect");
                        cur = loc; c = null; continue;
                    }
                    if (code != 200) throw new Exception("Download failed (" + code + ")");
                    break;
                }
                if (c == null) throw new Exception("Too many redirects");
                long total = c.getContentLength(), loaded = 0, lastSent = 0;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        loaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastSent > 150) {
                            lastSent = now;
                            JSObject p = new JSObject();
                            p.put("loaded", loaded);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                } finally { c.disconnect(); }
                if (total > 0 && loaded != total) throw new Exception("Download was cut off");
                if (!part.renameTo(out)) throw new Exception("Could not save the update");
                // Make sure it's EasyCut and really newer before handing it to the installer.
                PackageManager pm = getContext().getPackageManager();
                PackageInfo apk = pm.getPackageArchiveInfo(out.getAbsolutePath(), 0);
                PackageInfo me = pm.getPackageInfo(getContext().getPackageName(), 0);
                if (apk == null || !getContext().getPackageName().equals(apk.packageName)) { out.delete(); throw new Exception("The download isn't an EasyCut app"); }
                if (codeOf(apk) <= codeOf(me)) { out.delete(); throw new Exception("The download isn't newer than this app"); }
                JSObject p = new JSObject();
                p.put("loaded", loaded);
                p.put("total", loaded);
                notifyListeners("progress", p);
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("versionName", apk.versionName);
                r.put("versionCode", codeOf(apk));
                call.resolve(r);
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            } finally {
                downloading = false;
            }
        });
    }

    /** Opens Android's "Do you want to update this app?" screen for the downloaded APK. */
    @PluginMethod
    public void install(PluginCall call) {
        try {
            File f = new File(call.getString("path", ""));
            if (!f.exists() || !f.getCanonicalPath().startsWith(updatesDir().getCanonicalPath())) { call.reject("Update file not found"); return; }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updates", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject r = new JSObject();
            r.put("canInstall", canInstall());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not open the installer: " + e.getMessage());
        }
    }

    /** Opens a link from EasyCut's GitHub page in the phone's browser (fallback when in-app install isn't possible). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://github.com/amitogpandori/easycut/")) { call.reject("Link not allowed"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No browser found");
        }
    }
}
