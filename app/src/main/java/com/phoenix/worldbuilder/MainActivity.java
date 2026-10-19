package com.phoenix.worldbuilder;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import android.webkit.ValueCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import org.json.JSONObject;
import org.json.JSONException;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 41;
    private static final int SAVE_FILE = 42;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private File tempExport;
    private OutputStream tempStream;
    private String exportName = "phoenix_map.zip";
    private String exportMime = "application/zip";

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDefaultTextEncodingName("UTF-8");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    intent.setType("*/*");
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
            @Override public void onConsoleMessage(String message, int line, String sourceID) {
                android.util.Log.d("PhoenixWeb", sourceID+":"+line+" "+message);
            }
        });
        webView.addJavascriptInterface(new ExportBridge(), "NativeBridge");
        webView.loadUrl("file:///android_asset/index.html");
    }

    private static final int MAX_PROJECT_CHARS = 16000000;
    private static final String SCENE_MAIN = "phoenix_scene_autosave.json";
    private static final String SCENE_PREVIOUS = "phoenix_scene_previous.json";
    private static final String SCENE_MANUAL = "phoenix_scene_manual.json";

    private boolean isValidScene(String json) {
        if (json == null || json.isEmpty() || json.length() > MAX_PROJECT_CHARS) return false;
        try {
            JSONObject doc = new JSONObject(json);
            return doc.optJSONArray("objects") != null && doc.optJSONArray("heights") != null;
        } catch (JSONException ex) {
            return false;
        }
    }
    private String readScene(String name) {
        try {
            File file = new File(getFilesDir(), name);
            if (!file.isFile() || file.length() > MAX_PROJECT_CHARS) return "";
            String json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            return isValidScene(json) ? json : "";
        } catch (Exception ex) {
            android.util.Log.e("PhoenixSave", "read " + name, ex);
            return "";
        }
    }
    private void atomicMove(Path from, Path to) throws java.io.IOException {
        try {
            Files.move(from, to, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException unsupported) {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }
    private boolean writeScene(String name, String json, boolean makePrevious) {
        if (!isValidScene(json)) return false;
        try {
            File dir = getFilesDir();
            File current = new File(dir, name);
            File tmp = new File(dir, name + ".writing");
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            try (FileOutputStream out = new FileOutputStream(tmp, false)) {
                out.write(bytes);
                out.getFD().sync();
            }
            if (makePrevious && current.isFile() && !readScene(name).isEmpty()) {
                File backupTmp = new File(dir, SCENE_PREVIOUS + ".writing");
                Files.copy(current.toPath(), backupTmp.toPath(), StandardCopyOption.REPLACE_EXISTING);
                try (FileOutputStream out = new FileOutputStream(backupTmp, true)) {
                    out.getFD().sync();
                }
                atomicMove(backupTmp.toPath(), new File(dir, SCENE_PREVIOUS).toPath());
            }
            atomicMove(tmp.toPath(), current.toPath());
            return true;
        } catch (Exception ex) {
            android.util.Log.e("PhoenixSave", "write " + name, ex);
            return false;
        }
    }
    public class ExportBridge {
        @JavascriptInterface public synchronized boolean saveProject(String json) {
            return writeScene(SCENE_MAIN, json, true);
        }
        @JavascriptInterface public synchronized boolean saveManualProject(String json) {
            return writeScene(SCENE_MANUAL, json, false);
        }
        @JavascriptInterface public synchronized String loadProject() {
            String scene = readScene(SCENE_MAIN);
            if (scene.isEmpty()) scene = readScene(SCENE_PREVIOUS);
            if (scene.isEmpty()) scene = readScene(SCENE_MANUAL);
            return scene;
        }
        @JavascriptInterface public synchronized String loadBackupProject() {
            return readScene(SCENE_PREVIOUS);
        }
        @JavascriptInterface public synchronized String loadManualProject() {
            return readScene(SCENE_MANUAL);
        }
        @JavascriptInterface public synchronized void beginSave(String name, String mime) {
            try {
                if (tempStream != null) tempStream.close();
                exportName = name.replaceAll("[^a-zA-Zа-яА-ЯёЁ0-9._-]", "_");
                exportMime = mime;
                tempExport = new File(getCacheDir(), "pending_export.dat");
                tempStream = new FileOutputStream(tempExport, false);
            } catch (Exception e) { android.util.Log.e("PhoenixWeb", "beginSave", e); }
        }
        @JavascriptInterface public synchronized void appendSaveChunk(String base64) {
            try { if (tempStream != null) tempStream.write(Base64.decode(base64, Base64.DEFAULT)); }
            catch(Exception e) { android.util.Log.e("PhoenixWeb", "appendSaveChunk", e); }
        }
        @JavascriptInterface public synchronized void finishSave() {
            try {
                if (tempStream != null) { tempStream.flush(); tempStream.close(); tempStream = null; }
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(exportMime);
                    intent.putExtra(Intent.EXTRA_TITLE, exportName);
                    startActivityForResult(intent, SAVE_FILE);
                });
            } catch(Exception e) { android.util.Log.e("PhoenixWeb", "finishSave", e); }
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE) {
            if (fileCallback != null) {
                Uri[] out = null;
                if (result == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        android.content.ClipData clips = data.getClipData();
                        out = new Uri[clips.getItemCount()];
                        for (int i=0;i<out.length;i++) out[i]=clips.getItemAt(i).getUri();
                    } else if (data.getData() != null) out = new Uri[]{data.getData()};
                }
                fileCallback.onReceiveValue(out); fileCallback = null;
            }
        }
        if (request == SAVE_FILE && result == RESULT_OK && data != null && tempExport != null) {
            final Uri uri = data.getData();
            new Thread(() -> {
                try (FileInputStream input = new FileInputStream(tempExport);
                     OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = input.read(buf)) >= 0) output.write(buf, 0, n);
                    runOnUiThread(() -> Toast.makeText(this,"Файл успешно сохранён",Toast.LENGTH_SHORT).show());
                } catch (Exception ex) {
                    runOnUiThread(() -> Toast.makeText(this,"Ошибка сохранения: " + ex.getMessage(),Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }
    @Override public void onBackPressed() {
        // No implicit saves. The user decides whether to save before leaving.
        new android.app.AlertDialog.Builder(this)
            .setMessage("Закрыть Phoenix Builder? Несохранённые изменения будут потеряны.")
            .setPositiveButton("Сохранить и выйти", (d, which) -> {
                if (webView == null) { finish(); return; }
                webView.evaluateJavascript(
                    "(window.PhoenixPersistence&&window.PhoenixPersistence.flushNow?window.PhoenixPersistence.flushNow():false)",
                    result -> {
                        if ("true".equals(result)) finish();
                        else Toast.makeText(this, "Не удалось сохранить. Редактор остался открытым.", Toast.LENGTH_LONG).show();
                    });
            })
            .setNeutralButton("Выйти без сохранения", (d, which) -> finish())
            .setNegativeButton("Остаться", (d, which) -> {})
            .show();
    }
    @Override protected void onPause() {
        // Android Home/Recents must NEVER write a scene in manual-save mode.
        super.onPause();
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
