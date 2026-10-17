package com.shouna.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.util.Log;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 电子收纳册 —— 自包含 WebView 壳。
 * 加载内嵌于 assets/www 的构建产物，离线可用，点击即启动。
 * 通过 WebChromeClient.onShowFileChooser 支持页面里的
 * <input type="file">（相册选择 / 相机拍照）。
 */
public class MainActivity extends Activity {

  private static final int REQ_FILE_CHOOSER = 1001;

  private WebView web;
  private ValueCallback<Uri[]> filePathCallback;
  private Uri cameraUri;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    web = new WebView(this);
    // 允许通过 adb + Chrome DevTools 远程调试页面（仅本机 adb 可访问）
    WebView.setWebContentsDebuggingEnabled(true);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    // 让页面能用 IndexedDB / localStorage（Dexie 数据存储）
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    // file:// 页面读取自身的 JS/CSS/图片子资源
    s.setAllowFileAccess(true);
    s.setAllowFileAccessFromFileURLs(true);
    s.setAllowUniversalAccessFromFileURLs(true);
    s.setMediaPlaybackRequiresUserGesture(false);

    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback, FileChooserParams params) {
        Log.i("ShounaApp", "onShowFileChooser called, capture=" + params.isCaptureEnabled());
        // 清理上一次未完成的回调（连续点击场景）
        if (filePathCallback != null) {
          filePathCallback.onReceiveValue(null);
          filePathCallback = null;
        }
        filePathCallback = callback;

        // 相册/文件选择
        String accept = "*/*";
        String[] types = params.getAcceptTypes();
        if (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) {
          accept = types[0];
        }
        // <input multiple> -> MODE_OPEN_MULTIPLE，允许系统选择器多选
        boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
        Log.i("ShounaApp", "accept=" + accept + " mode=" + params.getMode() + " multiple=" + multiple);
        Intent content = new Intent(Intent.ACTION_GET_CONTENT);
        content.addCategory(Intent.CATEGORY_OPENABLE);
        content.setType(accept);
        if (multiple) {
          content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        // 相机：写入 MediaStore 得到 Uri，免去 FileProvider；拍照由系统相机 App 完成
        cameraUri = null;
        if (params.isCaptureEnabled()) {
          try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            Log.i("ShounaApp", "cameraUri=" + cameraUri);
          } catch (Exception e) {
            cameraUri = null;
            Log.w("ShounaApp", "cameraUri insert failed: " + e.getMessage());
          }
        }

        Intent chooser = Intent.createChooser(content, "选择图片");
        if (cameraUri != null) {
          Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
          camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
          chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try {
          startActivityForResult(chooser, REQ_FILE_CHOOSER);
          Log.i("ShounaApp", "chooser started");
        } catch (Exception e) {
          // 没有可用的选择器/相机 App
          filePathCallback.onReceiveValue(null);
          filePathCallback = null;
          Log.w("ShounaApp", "startActivityForResult failed: " + e.getMessage());
          return false;
        }
        return true;
      }
    });
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.loadUrl("file:///android_asset/www/index.html");
    setContentView(web);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQ_FILE_CHOOSER) {
      if (filePathCallback == null) return;
      Uri[] results = null;
      if (resultCode == RESULT_OK) {
        if (data != null && data.getClipData() != null) {
          // 相册多选：多个 Uri
          int n = data.getClipData().getItemCount();
          if (n > 0) {
            results = new Uri[n];
            for (int i = 0; i < n; i++) {
              results[i] = data.getClipData().getItemAt(i).getUri();
            }
          }
        } else if (data != null && data.getData() != null) {
          results = new Uri[]{data.getData()};
        } else if (cameraUri != null) {
          // 相机照片：经 EXTRA_OUTPUT 写回 MediaStore
          results = new Uri[]{cameraUri};
        }
      }
      Log.i("ShounaApp", "chooser result: " + (results == null ? "null" : results.length + " uris"));
      filePathCallback.onReceiveValue(results);
      filePathCallback = null;
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) {
      web.goBack();
    } else {
      super.onBackPressed();
    }
  }

  @Override
  protected void onDestroy() {
    if (web != null) {
      web.destroy();
      web = null;
    }
    super.onDestroy();
  }
}
