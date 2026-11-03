package androidx.core.app;
public final class ServiceCompat { public static final int STOP_FOREGROUND_REMOVE = 1;
  public static void startForeground(android.app.Service s, int id, android.app.Notification n, int type) {}
  public static void stopForeground(android.app.Service s, int flags) {} }
