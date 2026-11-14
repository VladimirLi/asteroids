#!/usr/bin/env bash
# Builds a signed Android App Bundle (.aab) for Google Play.
# First run creates your upload key. KEEP THE .jks FILE AND PASSWORD SAFE AND BACKED UP:
# without them you cannot publish updates (Play App Signing lets you reset an upload key, but it takes days).
set -euo pipefail
cd "$(dirname "$0")/.."
KS=android/upload-key.jks
PROPS=android/keystore.properties
if [ ! -f "$PROPS" ]; then
  read -r -s -p "Choose a keystore password (min 6 chars): " PW; echo
  keytool -genkeypair -v -keystore "$KS" -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PW" -keypass "$PW" -dname "CN=Perihelion Golf"
  printf "storeFile=upload-key.jks\nstorePassword=%s\nkeyAlias=upload\nkeyPassword=%s\n" "$PW" "$PW" > "$PROPS"
  chmod 600 "$PROPS"
  echo "Created $KS. Back it up now, together with the password."
fi
npx cap sync android
(cd android && ./gradlew bundleRelease assembleRelease)
echo
echo "Upload this to Play Console:  android/app/build/outputs/bundle/release/app-release.aab"
echo "Sideload test build:          android/app/build/outputs/apk/release/app-release.apk"
