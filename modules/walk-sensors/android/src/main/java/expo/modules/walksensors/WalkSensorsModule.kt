package expo.modules.walksensors

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WalkSensorsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WalkSensors")

    Function("getCapabilities") {
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val play = try {
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
      } catch (e: Exception) { false }
      mapOf(
        "stepDetector" to (sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null),
        "stepCounter" to (sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null),
        "gps" to lm.allProviders.contains(LocationManager.GPS_PROVIDER),
        "gpsEnabled" to lm.isProviderEnabled(LocationManager.GPS_PROVIDER),
        "activityRecognition" to play,
        "backgroundTracking" to true,
      )
    }

    AsyncFunction("startSession") { sessionId: String ->
      // Mark active synchronously so activeSession() is right before the service has started.
      EventLog.active = sessionId
      val intent = Intent(context, WalkTrackingService::class.java).putExtra(WalkTrackingService.EXTRA_SESSION, sessionId)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        EventLog.active = null
        throw e
      }
    }

    AsyncFunction("stopSession") {
      if (EventLog.active != null) {
        EventLog.active = null
        val intent = Intent(context, WalkTrackingService::class.java).setAction(WalkTrackingService.ACTION_STOP)
        context.startService(intent)
      }
    }

    Function("activeSession") {
      EventLog.active
    }

    AsyncFunction("appendEvent") { sessionId: String, json: String ->
      EventLog.appendRaw(context, sessionId, json)
    }

    AsyncFunction("readEvents") { sessionId: String, fromOffset: Double ->
      val (lines, offset) = EventLog.read(context, sessionId, fromOffset.toLong())
      mapOf("lines" to lines, "offset" to offset.toDouble())
    }

    AsyncFunction("deleteSession") { sessionId: String ->
      EventLog.delete(context, sessionId)
    }

    AsyncFunction("deleteAll") {
      EventLog.deleteAll(context)
    }
  }
}
