package com.kuhai.mandala;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 读取系统剪贴板中的图片（截图）。
 * Android 截图后剪贴板里是 image/png 的 URI，官方 Clipboard 插件只读文本读不到，
 * 这里专门读图片 URI 并转成 base64 dataURL 返回给前端。
 */
@CapacitorPlugin(name = "ClipboardImage")
public class ClipboardImagePlugin extends Plugin {

    private static final String TAG = "ClipboardImage";

    @PluginMethod
    public void readImage(PluginCall call) {
        try {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null || !clipboard.hasPrimaryClip()) {
                call.reject("no clipboard");
                return;
            }
            ClipDescription desc = clipboard.getPrimaryClipDescription();
            if (desc == null) {
                call.reject("no clip description");
                return;
            }
            // 截图剪贴板的 MIME 通常是 image/png 或 image/*
            boolean isImage = false;
            for (int i = 0; i < desc.getMimeTypeCount(); i++) {
                String mime = desc.getMimeType(i);
                if (mime != null && mime.startsWith("image/")) { isImage = true; break; }
            }
            if (!isImage) {
                call.reject("not image");
                return;
            }
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) {
                call.reject("empty clip");
                return;
            }
            ClipData.Item item = clip.getItemAt(0);
            Uri uri = item.getUri();
            if (uri == null) {
                // 部分机型截图存的是 Intent 而非 Uri，尝试 coerceToText 取不到图
                call.reject("no uri");
                return;
            }
            // 读取图片并压缩为 JPEG base64（避免 PNG 太大）
            Bitmap bmp = MediaStore.Images.Media.getBitmap(getContext().getContentResolver(), uri);
            if (bmp == null) {
                // 回退：用 InputStream 解码
                InputStream is = getContext().getContentResolver().openInputStream(uri);
                bmp = BitmapFactory.decodeStream(is);
                if (is != null) is.close();
            }
            if (bmp == null) {
                call.reject("decode failed");
                return;
            }
            // 限制最大边 1280，避免内存爆
            int maxSide = 1280;
            int w = bmp.getWidth(), h = bmp.getHeight();
            if (w > maxSide || h > maxSide) {
                float r = Math.min((float) maxSide / w, (float) maxSide / h);
                bmp = Bitmap.createScaledBitmap(bmp, Math.round(w * r), Math.round(h * r), true);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, baos);
            byte[] bytes = baos.toByteArray();
            String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            String dataURL = "data:image/jpeg;base64," + b64;
            JSObject ret = new JSObject();
            ret.put("value", dataURL);
            ret.put("type", "image/jpeg");
            ret.put("size", bytes.length);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readImage failed", e);
            call.reject("error: " + e.getMessage());
        }
    }
}
