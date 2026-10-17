package com.shouna.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 电子收纳册 —— 自包含 WebView 壳。
 * 加载内嵌于 assets/www 的构建产物，离线可用，点击即启动。
 * 通过 WebChromeClient.onShowFileChooser 支持页面里的 <input type="file">：
 * 点击后先弹自定义来源选择框（安卓相册 / 小米相册 / 拍照），再进入对应选择界面。
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

        String accept = "*/*";
        String[] types = params.getAcceptTypes();
        if (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) {
          accept = types[0];
        }
        // <input multiple> -> MODE_OPEN_MULTIPLE（支持多选）
        boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
        Log.i("ShounaApp", "accept=" + accept + " mode=" + params.getMode() + " multiple=" + multiple);

        showSourceDialog(multiple, accept);
        return true;
      }
    });
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.loadUrl("file:///android_asset/www/index.html");
    setContentView(web);
  }

  // ==================== 自定义来源选择框 ====================

  private void showSourceDialog(final boolean multiple, final String accept) {
    final Dialog dlg = new Dialog(this);
    dlg.requestWindowFeature(Window.FEATURE_NO_TITLE);

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    int pad = dp(14);
    root.setPadding(pad, pad, pad, pad);
    root.setBackgroundColor(0xFF1A1A26);

    TextView title = new TextView(this);
    title.setText("选择图片来源");
    title.setTextColor(0xFFEEEEFF);
    title.setTextSize(16);
    root.addView(title, new LinearLayout.LayoutParams(-1, -2));

    // 安卓系统相册（Photo Picker / DocumentsUI）
    root.addView(makeOption("📁  安卓相册（系统）", () -> {
      dlg.dismiss();
      launchSystemPicker(multiple, accept);
    }));

    // 小米相册（检测到才显示）
    if (hasMiuiGallery()) {
      root.addView(makeOption("🖼️  小米相册", () -> {
        dlg.dismiss();
        launchMiuiGallery(multiple, accept);
      }));
    }

    // 拍照
    root.addView(makeOption("📷  拍照", () -> {
      dlg.dismiss();
      launchCamera();
    }));

    // 取消
    root.addView(makeOption("取消", () -> {
      dlg.dismiss();
      cancelChooser();
    }));

    dlg.setContentView(root);
    Window w = dlg.getWindow();
    if (w != null) {
      w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
      w.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
      w.setGravity(Gravity.BOTTOM);
      w.setWindowAnimations(android.R.style.Animation_InputMethod);
    }
    dlg.setCancelable(true);
    dlg.setOnCancelListener(d -> cancelChooser());
    dlg.show();
    Log.i("ShounaApp", "source dialog shown");
  }

  private Button makeOption(String label, Runnable onClick) {
    Button b = new Button(this);
    b.setText(label);
    b.setTextColor(0xFFEEEEFF);
    b.setTextSize(15);
    b.setGravity(Gravity.CENTER_VERTICAL | Gravity.CENTER_HORIZONTAL);
    b.setBackgroundColor(0xFF26263A);
    b.setAllCaps(false);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
    lp.topMargin = dp(10);
    b.setLayoutParams(lp);
    b.setOnClickListener(v -> onClick.run());
    return b;
  }

  private void cancelChooser() {
    if (filePathCallback != null) {
      filePathCallback.onReceiveValue(null);
      filePathCallback = null;
    }
  }

  // ==================== 三种来源 ====================

  /** 安卓系统相册（Photo Picker / DocumentsUI，支持多选） */
  private void launchSystemPicker(boolean multiple, String accept) {
    Intent content = new Intent(Intent.ACTION_GET_CONTENT);
    content.addCategory(Intent.CATEGORY_OPENABLE);
    content.setType(accept);
    if (multiple) {
      content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    }
    try {
      startActivityForResult(content, REQ_FILE_CHOOSER);
      Log.i("ShounaApp", "system picker started");
    } catch (Exception e) {
      Log.w("ShounaApp", "system picker failed: " + e.getMessage());
      cancelChooser();
    }
  }

  /** 小米原生相册（MIUI Gallery 的选图界面，支持多选） */
  private void launchMiuiGallery(boolean multiple, String accept) {
    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType(accept);
    if (multiple) {
      i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    }
    i.setPackage("com.miui.gallery");
    try {
      startActivityForResult(i, REQ_FILE_CHOOSER);
      Log.i("ShounaApp", "miui gallery started");
    } catch (Exception e) {
      Log.w("ShounaApp", "miui gallery failed: " + e.getMessage());
      // 回退到系统选择器
      launchSystemPicker(multiple, accept);
    }
  }

  /** 相机拍照（写入 MediaStore 免 FileProvider） */
  private void launchCamera() {
    cameraUri = null;
    try {
      ContentValues cv = new ContentValues();
      cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
      cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
      Log.i("ShounaApp", "cameraUri=" + cameraUri);
    } catch (Exception e) {
      cameraUri = null;
      Log.w("ShounaApp", "cameraUri insert failed: " + e.getMessage());
    }
    Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
    camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
    try {
      startActivityForResult(camera, REQ_FILE_CHOOSER);
    } catch (Exception e) {
      Log.w("ShounaApp", "camera failed: " + e.getMessage());
      cancelChooser();
    }
  }

  private boolean hasMiuiGallery() {
    try {
      PackageManager pm = getPackageManager();
      pm.getPackageInfo("com.miui.gallery", 0);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  private int dp(int v) {
    return Math.round(v * getResources().getDisplayMetrics().density);
  }

  // ==================== 结果回传 ====================

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
