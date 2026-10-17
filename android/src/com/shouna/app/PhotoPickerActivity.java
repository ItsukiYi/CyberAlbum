package com.shouna.app;

import android.app.Activity;
import android.content.ContentUris;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;
import android.util.LruCache;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 自定义相册选择页：支持点击多选 + 手指拖拽连续多选。
 * 结果通过 EXTRA_RESULT_URIS（Uri[]）返回给 MainActivity。
 */
public class PhotoPickerActivity extends Activity {

  public static final String EXTRA_RESULT_URIS = "uris";

  private static final int REQ_PERMISSION = 2001;
  private static final int THUMB_TARGET = 320;

  private GridView grid;
  private TextView countView;
  private final List<Long> photoIds = new ArrayList<>();
  private final Set<Integer> selected = new HashSet<>();
  private final LruCache<Long, Bitmap> cache = new LruCache<Long, Bitmap>(48 * 1024 * 1024) {
    @Override
    protected int sizeOf(Long key, Bitmap value) {
      return value.getByteCount();
    }
  };
  private final ExecutorService pool = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());

  private int lastTouchPos = -1;
  private boolean dragSelect = true;
  private boolean loaded = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(buildUi());
    String perm = Build.VERSION.SDK_INT >= 33
        ? android.Manifest.permission.READ_MEDIA_IMAGES
        : android.Manifest.permission.READ_EXTERNAL_STORAGE;
    if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) {
      loadPhotos();
    } else {
      requestPermissions(new String[]{perm}, REQ_PERMISSION);
    }
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
    if (code == REQ_PERMISSION) {
      if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
        loadPhotos();
      } else {
        Toast.makeText(this, "需要相册权限才能选择照片", Toast.LENGTH_SHORT).show();
        finish();
      }
    }
  }

  private View buildUi() {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(0xFF101018);

    grid = new GridView(this);
    grid.setNumColumns(4);
    grid.setVerticalSpacing(dp(4));
    grid.setHorizontalSpacing(dp(4));
    grid.setPadding(dp(6), dp(6), dp(6), dp(6));
    root.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

    LinearLayout foot = new LinearLayout(this);
    foot.setOrientation(LinearLayout.HORIZONTAL);
    foot.setGravity(Gravity.CENTER_VERTICAL);
    foot.setPadding(dp(12), dp(10), dp(12), dp(10));
    foot.setBackgroundColor(0xFF1B1B26);

    countView = new TextView(this);
    countView.setTextColor(0xFFEEEEFF);
    countView.setText("已选 0 张");
    foot.addView(countView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    Button cancel = new Button(this);
    cancel.setText("取消");
    cancel.setOnClickListener(v -> finish());
    foot.addView(cancel);

    Button done = new Button(this);
    done.setText("完成");
    done.setTextColor(Color.WHITE);
    done.setBackgroundColor(0xFF007AFF);
    done.setOnClickListener(v -> finishWithResult());
    foot.addView(done);

    root.addView(foot, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    return root;
  }

  private void loadPhotos() {
    if (loaded) return;
    loaded = true;
    ContentResolver cr = getContentResolver();
    Cursor c = null;
    try {
      c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
          new String[]{MediaStore.Images.Media._ID},
          null, null, MediaStore.Images.Media.DATE_ADDED + " DESC");
      if (c != null) {
        int idx = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
        while (c.moveToNext()) photoIds.add(c.getLong(idx));
      }
    } catch (Exception e) {
      Log.w("ShounaApp", "query photos failed: " + e.getMessage());
    } finally {
      if (c != null) c.close();
    }
    Log.i("ShounaApp", "photo picker loaded " + photoIds.size() + " photos");
    grid.setAdapter(new PickerAdapter());
    if (photoIds.isEmpty()) {
      Toast.makeText(this, "相册里没有照片", Toast.LENGTH_SHORT).show();
    }
    grid.setOnItemClickListener((p, v, pos, id) -> toggle(pos));
    grid.setOnTouchListener(dragTouchListener);
  }

  private void toggle(int pos) {
    if (pos < 0 || pos >= photoIds.size()) return;
    if (selected.contains(pos)) {
      selected.remove(pos);
    } else {
      selected.add(pos);
    }
    refreshCells();
  }

  private void refreshCells() {
    countView.setText("已选 " + selected.size() + " 张");
    if (grid.getAdapter() != null) {
      ((BaseAdapter) grid.getAdapter()).notifyDataSetChanged();
    }
  }

  /** 拖拽多选：按下格子后滑动，滑过的格子连续选中（或连续取消）；空白处按下可滚动 */
  private final View.OnTouchListener dragTouchListener = new View.OnTouchListener() {
    @Override
    public boolean onTouch(View v, MotionEvent e) {
      int pos = grid.pointToPosition((int) e.getX(), (int) e.getY());
      switch (e.getActionMasked()) {
        case MotionEvent.ACTION_DOWN:
          if (pos >= 0 && pos < photoIds.size()) {
            dragSelect = !selected.contains(pos);
            applyPos(pos);
            lastTouchPos = pos;
            return true; // 吃掉事件，进入拖拽选择（此时 GridView 不滚动）
          }
          lastTouchPos = -1;
          return false; // 空白处按下：交给 GridView 滚动
        case MotionEvent.ACTION_MOVE:
          if (lastTouchPos >= 0 && pos >= 0 && pos < photoIds.size() && pos != lastTouchPos) {
            fillRange(lastTouchPos, pos);
            lastTouchPos = pos;
          }
          return lastTouchPos >= 0;
        case MotionEvent.ACTION_UP:
        case MotionEvent.ACTION_CANCEL:
          lastTouchPos = -1;
          return true;
      }
      return false;
    }
  };

  private void applyPos(int pos) {
    if (pos < 0 || pos >= photoIds.size()) return;
    if (dragSelect) selected.add(pos);
    else selected.remove(pos);
    refreshCells();
  }

  private void fillRange(int from, int to) {
    int a = Math.min(from, to);
    int b = Math.max(from, to);
    for (int i = a; i <= b; i++) {
      if (dragSelect) selected.add(i);
      else selected.remove(i);
    }
    refreshCells();
  }

  private void finishWithResult() {
    List<Integer> sorted = new ArrayList<>(selected);
    Collections.sort(sorted);
    Uri[] uris = new Uri[sorted.size()];
    for (int i = 0; i < sorted.size(); i++) {
      uris[i] = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, photoIds.get(sorted.get(i)));
    }
    Log.i("ShounaApp", "picker done, selected " + uris.length);
    Intent r = new Intent();
    r.putExtra(EXTRA_RESULT_URIS, uris);
    setResult(RESULT_OK, r);
    finish();
  }

  @Override
  protected void onDestroy() {
    pool.shutdown();
    super.onDestroy();
  }

  private int dp(int v) {
    return Math.round(v * getResources().getDisplayMetrics().density);
  }

  private int cellSize() {
    int screenW = getResources().getDisplayMetrics().widthPixels;
    return Math.max(1, (screenW - dp(24)) / 4);
  }

  private class PickerAdapter extends BaseAdapter {
    @Override
    public int getCount() {
      return photoIds.size();
    }

    @Override
    public Object getItem(int p) {
      return photoIds.get(p);
    }

    @Override
    public long getItemId(int p) {
      return photoIds.get(p);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
      FrameLayout cell;
      ImageView iv;
      View overlay;
      TextView badge;
      if (convertView instanceof FrameLayout) {
        cell = (FrameLayout) convertView;
        iv = (ImageView) cell.getChildAt(0);
        overlay = cell.getChildAt(1);
        badge = (TextView) cell.getChildAt(2);
      } else {
        cell = new FrameLayout(PhotoPickerActivity.this);
        cell.setLayoutParams(new GridView.LayoutParams(GridView.LayoutParams.MATCH_PARENT, cellSize()));
        iv = new ImageView(PhotoPickerActivity.this);
        iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cell.addView(iv, new FrameLayout.LayoutParams(-1, -1));

        overlay = new View(PhotoPickerActivity.this);
        overlay.setBackgroundColor(0x6600A8FF);
        cell.addView(overlay, new FrameLayout.LayoutParams(-1, -1));

        badge = new TextView(PhotoPickerActivity.this);
        badge.setTextColor(Color.WHITE);
        badge.setBackgroundColor(0xFF007AFF);
        badge.setGravity(Gravity.CENTER);
        badge.setTextSize(12);
        int p = dp(2);
        badge.setPadding(p, 0, p, 0);
        FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(dp(24), dp(24));
        bl.gravity = Gravity.TOP | Gravity.END;
        cell.addView(badge, bl);
      }

      long id = photoIds.get(position);
      boolean sel = selected.contains(position);
      overlay.setVisibility(sel ? View.VISIBLE : View.GONE);
      badge.setText(sel ? String.valueOf(selectedIndex(position) + 1) : "");
      iv.setImageResource(android.R.color.transparent);

      Bitmap bmp = cache.get(id);
      if (bmp != null) {
        iv.setImageBitmap(bmp);
      } else {
        pool.execute(() -> {
          Bitmap t = decodeThumb(id);
          if (t != null) cache.put(id, t);
          final Bitmap ft = t;
          main.post(() -> {
            if (grid.getAdapter() == null || ft == null) return;
            int child = position - grid.getFirstVisiblePosition();
            View v = grid.getChildAt(child);
            if (v instanceof FrameLayout) {
              ((ImageView) ((FrameLayout) v).getChildAt(0)).setImageBitmap(ft);
            }
          });
        });
      }
      return cell;
    }
  }

  private int selectedIndex(int pos) {
    List<Integer> sorted = new ArrayList<>(selected);
    Collections.sort(sorted);
    return sorted.indexOf(pos);
  }

  private Bitmap decodeThumb(long id) {
    ContentResolver cr = getContentResolver();
    Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
    // API <29：优先用系统生成的缩略图（快）；新版走采样解码
    if (Build.VERSION.SDK_INT < 29) {
      try {
        Bitmap t = MediaStore.Images.Thumbnails.getThumbnail(cr, id, MediaStore.Images.Thumbnails.MINI_KIND, null);
        if (t != null) return t;
      } catch (Exception ignored) {
      }
    }
    try {
      BitmapFactory.Options o = new BitmapFactory.Options();
      o.inJustDecodeBounds = true;
      try (InputStream is = cr.openInputStream(uri)) {
        if (is != null) BitmapFactory.decodeStream(is, null, o);
      }
      int sample = 1;
      while (o.outWidth / (sample * 2) >= THUMB_TARGET && o.outHeight / (sample * 2) >= THUMB_TARGET) {
        sample *= 2;
      }
      BitmapFactory.Options o2 = new BitmapFactory.Options();
      o2.inSampleSize = sample;
      try (InputStream is = cr.openInputStream(uri)) {
        if (is == null) return null;
        return BitmapFactory.decodeStream(is, null, o2);
      }
    } catch (Exception e) {
      return null;
    }
  }
}
