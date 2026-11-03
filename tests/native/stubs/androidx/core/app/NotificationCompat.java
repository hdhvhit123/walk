package androidx.core.app;
public class NotificationCompat { public static class Builder {
  public Builder(android.content.Context c, String ch) {}
  public Builder setContentTitle(CharSequence s) { return this; } public Builder setContentText(CharSequence s) { return this; }
  public Builder setSmallIcon(int i) { return this; } public Builder setOngoing(boolean b) { return this; }
  public Builder setContentIntent(android.app.PendingIntent p) { return this; } public android.app.Notification build() { return null; } } }
