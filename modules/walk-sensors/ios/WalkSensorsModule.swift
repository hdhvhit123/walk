import ExpoModulesCore

/// iOS implementation is planned (CMPedometer, CMMotionActivityManager,
/// CLLocationManager with background location). Until then the JS side runs
/// in limited mode on iOS and never grants verified rewards.
public class WalkSensorsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WalkSensors")

    Function("getCapabilities") { () -> [String: Bool] in
      return ["stepDetector": false, "stepCounter": false, "gps": false, "gpsEnabled": false, "activityRecognition": false, "backgroundTracking": false]
    }
    AsyncFunction("startSession") { (_: String) in }
    AsyncFunction("stopSession") { }
    Function("activeSession") { () -> String? in return nil }
    AsyncFunction("appendEvent") { (_: String, _: String) in }
    AsyncFunction("readEvents") { (_: String, _: Double) -> [String: Any] in
      return ["lines": [String](), "offset": 0.0]
    }
    AsyncFunction("deleteSession") { (_: String) in }
    AsyncFunction("deleteAll") { }
  }
}
