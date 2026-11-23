package com.amitoj.easycut;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "EasyCutMedia")
public class MediaPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "EasyCut-media";
        return name.replaceAll("[^A-Za-z0-9._ -]", "_");
    }
    private String displayName(String name) {
        return name.replaceAll("[/\\\\\\u0000-\\u001f]", "_");
    }

    private String fileName(Uri uri) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) name = c.getString(i);
            }
        } catch (Exception ignored) {}
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "EasyCut-media";
        return displayName(name);
    }

    private String uriMime(Uri uri) {
        try {
            String m = getContext().getContentResolver().getType(uri);
            return m == null ? "application/octet-stream" : m;
        } catch (Exception e) {
            return "application/octet-stream";
        }
    }

    private File importsDir() {
        File d = new File(getContext().getCacheDir(), "easycut-imports");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    @PluginMethod
    public void chooseMedia(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
            "image/*", "video/*", "application/x-troff-msvideo",
            "image/heic", "image/heif", "image/tiff",
            "application/vnd.rn-realmedia", "application/octet-stream"
        });
        try {
            startActivityForResult(call, i, "mediaPickerResult");
        } catch (Exception e) {
            call.reject("Could not open Android media picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void mediaPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("files", new JSArray());
            call.resolve(cancelled);
            return;
        }

        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int n = 0; n < data.getClipData().getItemCount(); n++) uris.add(data.getClipData().getItemAt(n).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        io.execute(() -> copyMedia(call, uris));
    }

    private void copyMedia(PluginCall call, List<Uri> uris) {
        try {
            File dir = importsDir();
            JSArray files = new JSArray(), errors = new JSArray();
            for (Uri u : uris) {
                String name = fileName(u);
                String mime = uriMime(u);
                File out = new File(dir, UUID.randomUUID() + "-" + safeName(name));
                try (InputStream in = getContext().getContentResolver().openInputStream(u);
                     OutputStream os = new FileOutputStream(out)) {
                    if (in == null) throw new Exception("Android returned no readable data");
                    byte[] buf = new byte[1024 * 1024];
                    int n;
                    long size = 0;
                    while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); size += n; }
                    JSObject r = new JSObject();
                    r.put("name", name);
                    r.put("mime", mime);
                    r.put("size", size);
                    r.put("path", out.getAbsolutePath());
                    files.put(r);
                } catch (Exception e) {
                    out.delete();
                    errors.put("Could not copy " + name + " from Android: " + e.getMessage());
                }
            }
            JSObject result = new JSObject();
            result.put("files", files);
            result.put("errors", errors);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not copy selected media: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteImported(PluginCall call) {
        try {
            String path = call.getString("path", "");
            File root = importsDir().getCanonicalFile();
            File file = new File(path).getCanonicalFile();
            if (!file.toPath().startsWith(root.toPath())) {
                call.reject("Not an EasyCut import file");
                return;
            }
            if (file.exists() && !file.delete()) throw new Exception("Could not clear the temporary media copy");
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not clear imported media: " + e.getMessage());
        }
    }
}
