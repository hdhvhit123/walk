#!/usr/bin/env bash
# Compile the Android tracking code (EventLog, service, receiver) without the
# Android SDK and run the EventLog tests on the JVM.
#   - android.jar classes come from Robolectric's android-all (Maven Central)
#   - androidx / Play services are replaced by signature stubs in tests/native/stubs
# The full Gradle build (CI) remains the real check; this is a fast local one.
set -euo pipefail
cd "$(dirname "$0")/.."
W=${WORK:-.native-check}
mkdir -p "$W"
[ -f "$W/android-all.jar" ] || curl -sSfL -o "$W/android-all.jar" \
  https://repo1.maven.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar
if [ ! -x "$W/kotlinc/bin/kotlinc" ]; then
  curl -sSfL -o "$W/kc.zip" https://github.com/JetBrains/kotlin/releases/download/v2.1.20/kotlin-compiler-2.1.20.zip
  (cd "$W" && unzip -q kc.zip)
fi
rm -rf "$W/stubcls" && mkdir -p "$W/stubcls"
javac -nowarn -cp "$W/android-all.jar" -d "$W/stubcls" $(find tests/native/stubs -name '*.java')
SRC=modules/walk-sensors/android/src/main/java/expo/modules/walksensors
"$W/kotlinc/bin/kotlinc" -jvm-target 17 -cp "$W/android-all.jar:$W/stubcls" -d "$W/main.jar" \
  $SRC/EventLog.kt $SRC/WalkTrackingService.kt $SRC/ActivityTransitionReceiver.kt
"$W/kotlinc/bin/kotlinc" -jvm-target 17 -cp "$W/android-all.jar:$W/main.jar" -d "$W/test.jar" tests/native/EventLogTest.kt
java -cp "$W/android-all.jar:$W/main.jar:$W/test.jar:$W/kotlinc/lib/kotlin-stdlib.jar" EventLogTestKt
