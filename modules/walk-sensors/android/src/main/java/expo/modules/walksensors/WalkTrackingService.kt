package expo.modules.walksensors

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import org.json.JSONObject

/**
 * Foreground service that records evidence for one walking session while
 * the screen is off: GNSS fixes, hardware step events (detector, or counter
 * deltas as a fallback), a liveness heartbeat, and activity transitions.
 */
class WalkTrackingService : Service(), SensorEventListener, LocationListener {
  private var sessionId: String? = null
  private lateinit var sensors: SensorManager
  private var locations: LocationManager? = null
  private val handler = Handler(Looper.getMainLooper())
  private var lastCounter: Float = -1f
  private var lastCounterT: Long = 0L
  private var stepSensorOn = false
  private var arIntent: PendingIntent? = null

  private val heartbeat = object : Runnable {
    override fun run() {
      val id = sessionId ?: return
      if (stepSensorOn) EventLog.append(this@WalkTrackingService, id, JSONObject().put("kind", "motion").put("t", System.currentTimeMillis()))
      handler.postDelayed(this, HEARTBEAT_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) { stopTracking(startId); return START_NOT_STICKY }
    val id = intent?.getStringExtra(EXTRA_SESSION) ?: run { stopSelf(startId); return START_NOT_STICKY }
    startInForeground()
    if (sessionId != id) {
      stopSensors()
      sessionId = id
      EventLog.active = id
      startSensors()
    }
    // Not sticky: if the OS kills us, the gap must show up as missing evidence, never be papered over.
    return START_NOT_STICKY
  }

  private fun startInForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Phiên đi bộ", NotificationManager.IMPORTANCE_LOW))
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle("Đang theo dõi chuyến đi bộ")
      .setContentText("Chạm để mở app. Kết thúc phiên để dừng theo dõi.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
  }

  private fun granted(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  private fun startSensors() {
    sensors = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val activityOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(Manifest.permission.ACTIVITY_RECOGNITION)
    if (activityOk) {
      val detector = sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
      val counter = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      stepSensorOn = when {
        detector != null -> sensors.registerListener(this, detector, SensorManager.SENSOR_DELAY_FASTEST)
        counter != null -> sensors.registerListener(this, counter, SensorManager.SENSOR_DELAY_FASTEST)
        else -> false
      }
    }
    if (granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
      locations = getSystemService(Context.LOCATION_SERVICE) as LocationManager
      try {
        locations?.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, Looper.getMainLooper())
      } catch (e: Exception) {
        log(JSONObject().put("kind", "note").put("t", System.currentTimeMillis()).put("msg", "gps-unavailable"))
      }
    }
    if (activityOk) startActivityTransitions()
    handler.post(heartbeat)
  }

  @SuppressLint("MissingPermission")
  private fun startActivityTransitions() {
    try {
      val types = listOf(DetectedActivity.IN_VEHICLE, DetectedActivity.ON_BICYCLE, DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.STILL)
      val transitions = types.flatMap { t ->
        listOf(ActivityTransition.ACTIVITY_TRANSITION_ENTER, ActivityTransition.ACTIVITY_TRANSITION_EXIT).map { kind ->
          ActivityTransition.Builder().setActivityType(t).setActivityTransition(kind).build()
        }
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
      val pi = PendingIntent.getBroadcast(this, 1, Intent(this, ActivityTransitionReceiver::class.java), flags)
      arIntent = pi
      ActivityRecognition.getClient(this).requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pi)
    } catch (e: Exception) {
      log(JSONObject().put("kind", "note").put("t", System.currentTimeMillis()).put("msg", "activity-recognition-unavailable"))
    }
  }

  @SuppressLint("MissingPermission")
  private fun stopSensors() {
    handler.removeCallbacks(heartbeat)
    if (::sensors.isInitialized) sensors.unregisterListener(this)
    locations?.removeUpdates(this)
    arIntent?.let { pi -> try { ActivityRecognition.getClient(this).removeActivityTransitionUpdates(pi) } catch (_: Exception) {} }
    arIntent = null
    stepSensorOn = false
    lastCounter = -1f
  }

  private fun stopTracking(startId: Int) {
    stopSensors()
    sessionId = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    // stopSelf(startId): a start request queued after this stop keeps the service alive.
    stopSelf(startId)
  }

  override fun onDestroy() {
    // Destroyed while still recording (not via stop): the app must see that.
    if (sessionId != null && EventLog.active == sessionId) EventLog.active = null
    stopSensors()
    super.onDestroy()
  }

  private fun log(json: JSONObject) { sessionId?.let { EventLog.append(this, it, json) } }

  /** Sensor timestamps are nanoseconds since boot; convert to wall-clock ms. */
  private fun wallMs(eventNanos: Long): Long = System.currentTimeMillis() - SystemClock.elapsedRealtime() + eventNanos / 1_000_000

  override fun onSensorChanged(event: SensorEvent) {
    when (event.sensor.type) {
      Sensor.TYPE_STEP_DETECTOR -> log(JSONObject().put("kind", "step").put("t", wallMs(event.timestamp)))
      Sensor.TYPE_STEP_COUNTER -> {
        val t = wallMs(event.timestamp)
        val value = event.values[0]
        if (lastCounter >= 0f && value > lastCounter) {
          // Spread the batched delta evenly over the interval since the last reading.
          val n = (value - lastCounter).toInt().coerceAtMost(200)
          val span = (t - lastCounterT).coerceAtLeast(1L)
          for (i in 1..n) log(JSONObject().put("kind", "step").put("t", lastCounterT + span * i / n))
        }
        lastCounter = value
        lastCounterT = t
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onLocationChanged(location: Location) {
    val json = JSONObject().put("kind", "fix").put("t", location.time)
      .put("lat", location.latitude).put("lng", location.longitude)
      .put("acc", if (location.hasAccuracy()) location.accuracy.toDouble() else 99.0)
    if (location.hasSpeed()) json.put("speed", location.speed.toDouble())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && location.isMock) json.put("mock", true)
    log(json)
  }

  @Deprecated("Deprecated in API 29")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  override fun onProviderEnabled(provider: String) {}
  override fun onProviderDisabled(provider: String) {
    log(JSONObject().put("kind", "note").put("t", System.currentTimeMillis()).put("msg", "gps-disabled"))
  }

  companion object {
    const val ACTION_STOP = "expo.modules.walksensors.STOP"
    const val EXTRA_SESSION = "sessionId"
    private const val CHANNEL = "walk_session"
    private const val NOTIFICATION_ID = 4711
    private const val HEARTBEAT_MS = 2000L
  }
}
