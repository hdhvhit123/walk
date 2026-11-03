package expo.modules.walksensors

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import org.json.JSONObject

/** Writes Activity Recognition transitions into the active session log. */
class ActivityTransitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val id = EventLog.active ?: return
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    for (e in result.transitionEvents) {
      val t = System.currentTimeMillis() - SystemClock.elapsedRealtime() + e.elapsedRealTimeNanos / 1_000_000
      val type = when (e.activityType) {
        DetectedActivity.IN_VEHICLE -> "IN_VEHICLE"
        DetectedActivity.ON_BICYCLE -> "ON_BICYCLE"
        DetectedActivity.WALKING -> "WALKING"
        DetectedActivity.RUNNING -> "RUNNING"
        DetectedActivity.STILL -> "STILL"
        else -> "OTHER"
      }
      EventLog.append(context, id, JSONObject().put("kind", "activity").put("t", t).put("type", type)
        .put("enter", e.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER))
    }
  }
}
