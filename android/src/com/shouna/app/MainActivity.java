package com.shouna.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 电子收纳册 —— 自包含 WebView 壳。
 * 加载内嵌于 assets/www 的构建产物，离线可用，点击即启动。
 */
public class MainActivity extends Activity {

  private WebView web;

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
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.loadUrl("file:///android_asset/www/index.html");
    setContentView(web);
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
