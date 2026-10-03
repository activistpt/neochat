#!/usr/bin/env bash
# Build the NEOCHAT native Android APK without Gradle.
# Requires: Android SDK (platform android-37.0 + build-tools 36.0.0) and a JDK 17.
#
# Usage (Git Bash on Windows / Linux):
#   ./build-apk.sh
#
# Output: build/apk/NEOCHAT-<VERSION>.apk  (signed with the debug keystore)

set -euo pipefail

cd "$(dirname "$0")"

VERSION="${1:-1.0.0}"
VERSION_CODE="${2:-100}"

JBR="${JBR:-/c/Program Files/Android/Android Studio/jbr}"
export JAVA_HOME="${JAVA_HOME:-$JBR}"
SDK="${ANDROID_SDK_ROOT:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/36.0.0"
PLATFORM="$SDK/platforms/android-37.0"
KS_WIN="C:\\Users\\$USER\\.android\\debug.keystore"

rm -rf build/classes build/dex build/res build/apk build/gen
mkdir -p build/classes build/dex build/res build/apk build/gen

# 1. Debug keystore (created once, reused)
mkdir -p "/c/Users/$USER/.android"
if [ ! -f "/c/Users/$USER/.android/debug.keystore" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -v -keystore "$KS_WIN" \
    -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi

# 2. Compile Java -> class files
CP="$PLATFORM/android.jar"
LIBARGS=""
for j in app/libs/*.jar; do LIBARGS="$LIBARGS $j"; done

"$JAVA_HOME/bin/javac" --release 17 -encoding UTF-8 -nowarn \
  -classpath "$CP" -d build/classes \
  $(find app/src/main/java -name '*.java')

# 3. class files + libs -> DEX
"$BT/d8.bat" --release --min-api 24 --lib "$CP" \
  --output build/dex \
  $(find build/classes -name '*.class') $LIBARGS

# 4. Compile resources
"$BT/aapt2.exe" compile --dir app/src/main/res -o build/res/

# 5. Link manifest + resources (DEX is injected below, not via aapt2)
"$BT/aapt2.exe" link \
  -o build/apk/base.apk \
  -I "$PLATFORM/android.jar" \
  --manifest app/src/main/AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 37 \
  --version-code "$VERSION_CODE" --version-name "$VERSION" \
  build/res/*.flat

# 6. Inject DEX into the resource APK
python3 - "$@" <<'PY'
import sys, zipfile, os
base = "build/apk/base.apk"
out  = f"build/apk/neochat-unsigned.apk"
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.namelist():
        zout.writestr(item, zin.read(item))
    with open("build/dex/classes.dex", "rb") as f:
        zout.writestr("classes.dex", f.read())
PY

# 7. Align + sign
"$BT/zipalign.exe" -f -p 4 build/apk/neochat-unsigned.apk build/apk/neochat-aligned.apk
"$BT/apksigner.bat" sign \
  --ks "$KS_WIN" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --min-sdk-version 24 \
  --out "build/apk/NEOCHAT-$VERSION.apk" build/apk/neochat-aligned.apk

# 8. Verify
"$BT/apksigner.bat" verify --verbose "build/apk/NEOCHAT-$VERSION.apk" 2>&1 | grep -vE '^WARNING'

echo
echo "OK -> build/apk/NEOCHAT-$VERSION.apk"