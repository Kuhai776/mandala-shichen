package com.kuhai.mandala;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

/**
 * Round22/23：正计时前台服务 — 常驻通知 + 提高进程优先级。
 * Round23：原生 Handler 每秒自走秒（WebView 被冻时标题仍刷新）。
 * 类型 specialUse（格子正计时，非标准 FGS 类别）。
 */
public class TimerForegroundService extends Service {
  public static final String ACTION_START = "com.kuhai.mandala.TIMER_FGS_START";
  public static final String ACTION_UPDATE = "com.kuhai.mandala.TIMER_FGS_UPDATE";
  public static final String ACTION_STOP = "com.kuhai.mandala.TIMER_FGS_STOP";
  public static final String ACTION_BUTTON = "com.kuhai.mandala.TIMER_FGS_BUTTON";

  public static final String EXTRA_ID = "id";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_BODY = "body";
  public static final String EXTRA_CHANNEL = "channelId";
  public static final String EXTRA_SMALL_ICON = "smallIcon";
  public static final String EXTRA_PERIOD = "period";
  public static final String EXTRA_CELL = "cell";
  public static final String EXTRA_BUTTONS = "buttons"; // "pause:暂停|stop:结束"
  public static final String EXTRA_ACTION_ID = "actionId";
  public static final String EXTRA_PAUSED = "paused";
  public static final String EXTRA_ELAPSED_MS = "elapsedMs";
  public static final String EXTRA_TASK_LABEL = "taskLabel";

  public static final String DEFAULT_CHANNEL = "mandala_timer_fgs";
  public static final int DEFAULT_NOTIF_ID = 16115;

  private static volatile boolean sRunning = false;
  private int notifId = DEFAULT_NOTIF_ID;

  private String lastTitle = "计时中";
  private String lastBody = "正计时进行中";
  private String lastChannelId = DEFAULT_CHANNEL;
  private String lastSmallIcon = "ic_stat_timer";
  private String lastButtons = "";
  private int lastPeriod = -1;
  private int lastCell = -1;
  private boolean lastPaused = false;
  private long elapsedBaseMs = 0;
  private long elapsedWallAt = 0;
  private String taskLabel = "任务";

  private final Handler tickHandler = new Handler(Looper.getMainLooper());
  private final Runnable tickRunnable = new Runnable() {
    @Override
    public void run() {
      if (!sRunning || lastPaused) return;
      long elapsed = elapsedBaseMs + Math.max(0, System.currentTimeMillis() - elapsedWallAt);
      lastTitle = "⏱ " + formatClock(elapsed) + " · " + (taskLabel != null ? taskLabel : "任务");
      try {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
          nm.notify(notifId, buildNotification(
            lastTitle, lastBody, lastChannelId, lastSmallIcon, lastButtons, lastPeriod, lastCell
          ));
        }
      } catch (Exception ignored) {}
      tickHandler.postDelayed(this, 1000);
    }
  };

  public static boolean isRunning() {
    return sRunning;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    String action = intent.getAction();
    if (ACTION_STOP.equals(action)) {
      stopTick();
      sRunning = false;
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    if (ACTION_BUTTON.equals(action)) {
      String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
      int period = intent.getIntExtra(EXTRA_PERIOD, -1);
      int cell = intent.getIntExtra(EXTRA_CELL, -1);
      TimerForegroundPlugin.emitAction(actionId, period, cell);
      bringAppToFront();
      return sRunning ? START_STICKY : START_NOT_STICKY;
    }

    notifId = intent.getIntExtra(EXTRA_ID, DEFAULT_NOTIF_ID);
    String title = intent.getStringExtra(EXTRA_TITLE);
    String body = intent.getStringExtra(EXTRA_BODY);
    String channelId = intent.getStringExtra(EXTRA_CHANNEL);
    String smallIcon = intent.getStringExtra(EXTRA_SMALL_ICON);
    String buttons = intent.getStringExtra(EXTRA_BUTTONS);
    int period = intent.getIntExtra(EXTRA_PERIOD, -1);
    int cell = intent.getIntExtra(EXTRA_CELL, -1);
    boolean paused = intent.getBooleanExtra(EXTRA_PAUSED, false);
    long elapsedMs = intent.getLongExtra(EXTRA_ELAPSED_MS, 0);
    String task = intent.getStringExtra(EXTRA_TASK_LABEL);

    if (title == null) title = "计时中";
    if (body == null) body = "正计时进行中";
    if (channelId == null || channelId.isEmpty()) channelId = DEFAULT_CHANNEL;

    lastTitle = title;
    lastBody = body;
    lastChannelId = channelId;
    lastSmallIcon = smallIcon != null ? smallIcon : "ic_stat_timer";
    lastButtons = buttons != null ? buttons : "";
    lastPeriod = period;
    lastCell = cell;
    lastPaused = paused;
    elapsedBaseMs = Math.max(0, elapsedMs);
    elapsedWallAt = System.currentTimeMillis();
    if (task != null && !task.isEmpty()) taskLabel = task;

    ensureChannel(channelId);
    Notification notification = buildNotification(title, body, channelId, smallIcon, buttons, period, cell);

    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(notifId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      } else {
        startForeground(notifId, notification);
      }
      sRunning = true;
      if (paused) {
        stopTick();
      } else {
        startTick();
      }
    } catch (Exception e) {
      stopTick();
      sRunning = false;
      stopSelf();
      return START_NOT_STICKY;
    }
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    stopTick();
    sRunning = false;
    super.onDestroy();
  }

  private void startTick() {
    tickHandler.removeCallbacks(tickRunnable);
    tickHandler.postDelayed(tickRunnable, 1000);
  }

  private void stopTick() {
    tickHandler.removeCallbacks(tickRunnable);
  }

  private static String formatClock(long ms) {
    long totalSec = Math.max(0, ms) / 1000;
    long mm = totalSec / 60;
    long ss = totalSec % 60;
    return String.format("%02d:%02d", mm, ss);
  }

  private void ensureChannel(String channelId) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(channelId);
    if (existing != null) return;
    NotificationChannel ch = new NotificationChannel(
      channelId,
      "正计时（前台服务）",
      NotificationManager.IMPORTANCE_HIGH
    );
    ch.setDescription("格子正计时常驻通知，用于降低后台被系统杀掉的概率");
    ch.setSound(null, null);
    ch.enableVibration(false);
    ch.setShowBadge(false);
    nm.createNotificationChannel(ch);
  }

  private Notification buildNotification(
    String title,
    String body,
    String channelId,
    String smallIconName,
    String buttonsPacked,
    int period,
    int cell
  ) {
    int iconRes = getResources().getIdentifier(
      smallIconName != null && !smallIconName.isEmpty() ? smallIconName : "ic_stat_timer",
      "drawable",
      getPackageName()
    );
    if (iconRes == 0) {
      iconRes = getApplicationInfo().icon;
    }

    Intent tapIntent = new Intent(this, MainActivity.class);
    tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
    tapIntent.putExtra("deep", "record-cell");
    tapIntent.putExtra(EXTRA_PERIOD, period);
    tapIntent.putExtra(EXTRA_CELL, cell);
    PendingIntent tapPi = PendingIntent.getActivity(
      this,
      0,
      tapIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(iconRes)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(tapPi)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

    if (buttonsPacked != null && !buttonsPacked.isEmpty()) {
      String[] parts = buttonsPacked.split("\\|");
      int req = 100;
      for (String part : parts) {
        if (part == null || part.isEmpty()) continue;
        int colon = part.indexOf(':');
        if (colon <= 0) continue;
        String actionId = part.substring(0, colon);
        String label = part.substring(colon + 1);
        Intent bi = new Intent(this, TimerForegroundService.class);
        bi.setAction(ACTION_BUTTON);
        bi.putExtra(EXTRA_ACTION_ID, actionId);
        bi.putExtra(EXTRA_PERIOD, period);
        bi.putExtra(EXTRA_CELL, cell);
        PendingIntent bPi = PendingIntent.getService(
          this,
          req++,
          bi,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        builder.addAction(0, label, bPi);
      }
    }

    return builder.build();
  }

  private void bringAppToFront() {
    try {
      Intent i = new Intent(this, MainActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      startActivity(i);
    } catch (Exception ignored) {}
  }
}
