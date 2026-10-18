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

    public class ExportBridge {
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
        // Prevent accidental loss of the current offline scene. Use editor menu to save.
        new android.app.AlertDialog.Builder(this).setMessage("Закрыть 3D-редактор?")
            .setPositiveButton("Закрыть", (d,which)->super.onBackPressed())
            .setNegativeButton("Остаться", (d,which)->{}).show();
    }
    @Override protected void onDestroy(){if(webView!=null)webView.destroy();super.onDestroy();}
}
