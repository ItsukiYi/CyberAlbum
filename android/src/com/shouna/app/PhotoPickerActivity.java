package com.shouna.app;

import android.app.Activity;
import android.content.ContentUris;
import android.content.ContentResolver;
import android.content.Context;
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
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
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
 * 自定义相册选择页：
 *  - 普通滑动 = 滚动浏览
 *  - 长按某张照片 = 进入多选模式（震动提示），点按切换勾选
 *  - 多选模式下拖动 = 滑过的格子连续选中/取消（拖拽多选）
 * 结果通过 EXTRA_RESULT_URIS（Uri[]）返回给 MainActivity。
 */
public class PhotoPickerActivity extends Activity {

  public static final String EXTRA_RESULT_URIS = "uris";

  private static final int REQ_PERMISSION = 2001;
  private static final int THUMB_TARGET = 320;
  private static final long LONG_PRESS_MS = 350;

  private PickerGridView grid;
  private TextView countView;
  private TextView hintView;
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

    hintView = new TextView(this);
    hintView.setText("长按照片进入多选，拖动连续勾选");
    hintView.setTextColor(0xFFBBBBCC);
    hintView.setGravity(Gravity.CENTER);
    hintView.setPadding(dp(6), dp(8), dp(6), dp(8));
    hintView.setBackgroundColor(0xFF1B1B26);
    root.addView(hintView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    grid = new PickerGridView(this);
    grid.setNumColumns(4);
    grid.setVerticalSpacing(dp(4));
    grid.setHorizontalSpacing(dp(4));
    grid.setPadding(dp(6), dp(6), dp(6), dp(6));
    grid.setLongPressListener(pos -> enterSelectionMode(pos));
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
    cancel.setOnClickListener(v -> exitSelectionMode());
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
  }

  /** 长按激活多选模式 */
  private void enterSelectionMode(int pos) {
    if (pos < 0 || pos >= photoIds.size()) return;
    if (!grid.selectionMode) {
      grid.selectionMode = true;
      hintView.setText("已进入多选：点按勾选，拖动连续选择，点「取消」退出");
    }
    grid.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
    selected.add(pos);
    // 手指未抬起继续拖动时，从长按的这格开始连续选中
    grid.lastTouchPos = pos;
    grid.dragSelect = true;
    updateCell(pos);
    updateCount();
  }

  private void exitSelectionMode() {
    grid.selectionMode = false;
    grid.lastTouchPos = -1;
    selected.clear();
    hintView.setText("长按照片进入多选，拖动连续勾选");
    updateAllVisibleCells();
    updateCount();
  }

  private void updateCount() {
    countView.setText("已选 " + selected.size() + " 张");
  }

  /** 只更新单个可见格子的选中遮罩/序号，不动缩略图（避免变黑重载） */
  private void updateCell(int pos) {
    int child = pos - grid.getFirstVisiblePosition();
    View v = grid.getChildAt(child);
    if (v instanceof FrameLayout) {
      FrameLayout cell = (FrameLayout) v;
      View overlay = cell.getChildAt(1);
      TextView badge = (TextView) cell.getChildAt(2);
      boolean sel = selected.contains(pos);
      overlay.setVisibility(sel ? View.VISIBLE : View.GONE);
      badge.setText(sel ? String.valueOf(selectedIndex(pos) + 1) : "");
    }
  }

  private void updateAllVisibleCells() {
    int first = grid.getFirstVisiblePosition();
    int last = grid.getLastVisiblePosition();
    for (int i = first; i <= last && i >= 0; i++) {
      updateCell(i);
    }
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
    grid.removeCallbacks(null);
    super.onDestroy();
  }

  private int dp(int v) {
    return Math.round(v * getResources().getDisplayMetrics().density);
  }

  private int cellSize() {
    int screenW = getResources().getDisplayMetrics().widthPixels;
    return Math.max(1, (screenW - dp(24)) / 4);
  }

  private int selectedIndex(int pos) {
    List<Integer> sorted = new ArrayList<>(selected);
    Collections.sort(sorted);
    return sorted.indexOf(pos);
  }

  /**
   * 手势分离：普通滑动 = GridView 正常滚动；长按激活选择模式后，
   * 拦截事件交给拖拽连续选择。
   */
  private interface LongPressListener {
    void onLongPress(int pos);
  }

  private class PickerGridView extends GridView {
    boolean selectionMode = false;
    int lastTouchPos = -1;
    private final Runnable longPressCheck;
    private float downX, downY;
    private int downPos = -1;
    private boolean dragSelect = true;

    PickerGridView(Context c) {
      super(c);
      longPressCheck = () -> {
        if (downPos >= 0) {
          LongPressListener l = longPressListener;
          if (l != null) l.onLongPress(downPos);
        }
      };
    }

    private LongPressListener longPressListener;

    void setLongPressListener(LongPressListener l) {
      this.longPressListener = l;
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
      int action = e.getActionMasked();
      if (action == MotionEvent.ACTION_DOWN) {
        if (selectionMode) {
          return true; // 选择模式：全部交给 onTouchEvent
        }
        downX = e.getX();
        downY = e.getY();
        downPos = pointToPosition((int) e.getX(), (int) e.getY());
        postDelayed(longPressCheck, LONG_PRESS_MS);
      } else if (action == MotionEvent.ACTION_MOVE) {
        if (selectionMode) {
          return true;
        }
        int slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
        if (Math.abs(e.getX() - downX) > slop || Math.abs(e.getY() - downY) > slop) {
          removeCallbacks(longPressCheck); // 滑动距离大：视为滚动，取消长按
          downPos = -1;
        }
      } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
        removeCallbacks(longPressCheck);
        downPos = -1;
      }
      return super.onInterceptTouchEvent(e);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
      int action = e.getActionMasked();
      if (selectionMode) {
        int pos = pointToPosition((int) e.getX(), (int) e.getY());
        switch (action) {
          case MotionEvent.ACTION_DOWN:
            if (pos >= 0 && pos < photoIds.size()) {
              dragSelect = !selected.contains(pos);
              applyPos(pos);
              lastTouchPos = pos;
            }
            return true;
          case MotionEvent.ACTION_MOVE:
            if (lastTouchPos >= 0 && pos >= 0 && pos < photoIds.size() && pos != lastTouchPos) {
              fillRange(lastTouchPos, pos);
              lastTouchPos = pos;
            }
            return true;
          case MotionEvent.ACTION_UP:
          case MotionEvent.ACTION_CANCEL:
            lastTouchPos = -1;
            return true;
        }
        return true;
      }
      return super.onTouchEvent(e);
    }

    private void applyPos(int pos) {
      if (pos < 0 || pos >= photoIds.size()) return;
      if (dragSelect) selected.add(pos);
      else selected.remove(pos);
      updateCell(pos);
      updateCount();
    }

    private void fillRange(int from, int to) {
      int a = Math.min(from, to);
      int b = Math.max(from, to);
      for (int i = a; i <= b; i++) {
        if (i < 0 || i >= photoIds.size()) continue;
        if (dragSelect) selected.add(i);
        else selected.remove(i);
        updateCell(i);
      }
      updateCount();
    }
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
      cell.setTag(position);

      long id = photoIds.get(position);
      boolean sel = selected.contains(position);
      overlay.setVisibility(sel ? View.VISIBLE : View.GONE);
      badge.setText(sel ? String.valueOf(selectedIndex(position) + 1) : "");
      // 注意：不复用视图时清空图片 —— 保留旧图直到新图到位，避免闪烁/变黑
      Bitmap bmp = cache.get(id);
      if (bmp != null) {
        iv.setImageBitmap(bmp);
      } else {
        pool.execute(() -> {
          Bitmap t = decodeThumb(id);
          if (t != null) cache.put(id, t);
          final Bitmap ft = t;
          final int pos = position;
          main.post(() -> {
            if (ft == null) return;
            int child = pos - grid.getFirstVisiblePosition();
            View v = grid.getChildAt(child);
            if (v instanceof FrameLayout && v.getTag() != null && (Integer) v.getTag() == pos) {
              ((ImageView) ((FrameLayout) v).getChildAt(0)).setImageBitmap(ft);
            }
          });
        });
      }
      return cell;
    }
  }

  private Bitmap decodeThumb(long id) {
    ContentResolver cr = getContentResolver();
    Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
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
