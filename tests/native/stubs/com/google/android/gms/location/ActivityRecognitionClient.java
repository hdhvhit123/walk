package com.google.android.gms.location;
public interface ActivityRecognitionClient {
  com.google.android.gms.tasks.Task<Void> requestActivityTransitionUpdates(ActivityTransitionRequest r, android.app.PendingIntent p);
  com.google.android.gms.tasks.Task<Void> removeActivityTransitionUpdates(android.app.PendingIntent p); }
