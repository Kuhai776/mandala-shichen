package com.kuhai.mandala;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * Round22：JS ↔ 前台服务桥。start / update / stop；按钮 → action 事件。
 */
@CapacitorPlugin(name = "TimerForeground")
public class TimerForegroundPlugin extends Plugin {
  private static WeakReference<TimerForegroundPlugin> sInstance;

  @Override
  public void load() {
    sInstance = new WeakReference<>(this);
  }

  static void emitAction(String actionId, int period, int cell) {
    TimerForegroundPlugin plugin = sInstance != null ? sInstance.get() : null;
    if (plugin == null) return;
    JSObject data = new JSObject();
    data.put("actionId", actionId != null ? actionId : "");
    data.put("period", period);
    data.put("cell", cell);
    plugin.notifyListeners("action", data);
  }

  @PluginMethod
  public void start(PluginCall call) {
    try {
      startOrUpdate(call, true);
      call.resolve();
    } catch (Exception e) {
      call.reject("FGS start failed: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void update(PluginCall call) {
    try {
      startOrUpdate(call, false);
      call.resolve();
    } catch (Exception e) {
      call.reject("FGS update failed: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    try {
      Intent intent = new Intent(getContext(), TimerForegroundService.class);
      intent.setAction(TimerForegroundService.ACTION_STOP);
      getContext().startService(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("FGS stop failed: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void isRunning(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("running", TimerForegroundService.isRunning());
    call.resolve(ret);
  }

  private void startOrUpdate(PluginCall call, boolean forceStart) {
    String title = call.getString("title", "计时中");
    String body = call.getString("body", "正计时进行中");
    String channelId = call.getString("channelId", TimerForegroundService.DEFAULT_CHANNEL);
    String smallIcon = call.getString("smallIcon", "ic_stat_timer");
    int id = call.getInt("id", TimerForegroundService.DEFAULT_NOTIF_ID);
    int period = call.getInt("period", -1);
    int cell = call.getInt("cell", -1);
    boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
    long elapsedMs = call.getInt("elapsedMs", 0);
    String taskLabel = call.getString("taskLabel", "任务");

    StringBuilder buttons = new StringBuilder();
    JSArray arr = call.getArray("buttons");
    if (arr != null) {
      for (int i = 0; i < arr.length(); i++) {
        try {
          JSONObject o = arr.getJSONObject(i);
          String aid = o.optString("id", "");
          String label = o.optString("title", "");
          if (aid.isEmpty() || label.isEmpty()) continue;
          if (buttons.length() > 0) buttons.append("|");
          // 防冒号污染
          buttons.append(aid.replace(":", "")).append(":").append(label.replace("|", "/"));
        } catch (Exception ignored) {}
      }
    }

    Intent intent = new Intent(getContext(), TimerForegroundService.class);
    intent.setAction(forceStart || !TimerForegroundService.isRunning()
      ? TimerForegroundService.ACTION_START
      : TimerForegroundService.ACTION_UPDATE);
    intent.putExtra(TimerForegroundService.EXTRA_ID, id);
    intent.putExtra(TimerForegroundService.EXTRA_TITLE, title);
    intent.putExtra(TimerForegroundService.EXTRA_BODY, body);
    intent.putExtra(TimerForegroundService.EXTRA_CHANNEL, channelId);
    intent.putExtra(TimerForegroundService.EXTRA_SMALL_ICON, smallIcon);
    intent.putExtra(TimerForegroundService.EXTRA_PERIOD, period);
    intent.putExtra(TimerForegroundService.EXTRA_CELL, cell);
    intent.putExtra(TimerForegroundService.EXTRA_BUTTONS, buttons.toString());
    intent.putExtra(TimerForegroundService.EXTRA_PAUSED, paused);
    intent.putExtra(TimerForegroundService.EXTRA_ELAPSED_MS, elapsedMs);
    intent.putExtra(TimerForegroundService.EXTRA_TASK_LABEL, taskLabel);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(getContext(), intent);
    } else {
      getContext().startService(intent);
    }
  }
}
