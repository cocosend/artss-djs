#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BUILD_DIR="$PWD/build"
SIGN_DIR="$RUNNER_TEMP/artss-signing"
KEYCHAIN="$RUNNER_TEMP/artss-signing.keychain-db"
mkdir -p "$BUILD_DIR/ipa"
if [[ "${SIGNED_BUILD:-false}" == true ]]; then
  for NAME in APPLE_TEAM_ID APPLE_CERT_P12 APPLE_CERT_PASSWORD APPLE_PROVISION_PROFILE; do
    [[ -n "${!NAME:-}" ]] || { echo "::error::Missing repository secret: $NAME"; exit 1; }
  done
  mkdir -p "$SIGN_DIR"
  export SIGN_DIR KEYCHAIN
  python3 - <<'PY'
import os,base64,pathlib
root=pathlib.Path(os.environ['SIGN_DIR'])
for name,file in [('APPLE_CERT_P12','certificate.p12'),('APPLE_PROVISION_PROFILE','profile.mobileprovision')]:
    try: data=base64.b64decode(''.join(os.environ[name].split()),validate=True)
    except ValueError: raise SystemExit('Invalid Base64 in '+name)
    (root/file).write_bytes(data)
PY
  security cms -D -i "$SIGN_DIR/profile.mobileprovision" > "$SIGN_DIR/profile.plist"
  python3 scripts/ios-profile.py
  KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"
  echo "::add-mask::$KEYCHAIN_PASSWORD"
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  security set-keychain-settings -lut 21600 "$KEYCHAIN"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  security import "$SIGN_DIR/certificate.p12" -P "$APPLE_CERT_PASSWORD" -k "$KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
  security list-keychains -d user -s "$KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db"
  for PROFILE_DIR in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$PROFILE_DIR"
    cp "$SIGN_DIR/profile.mobileprovision" "$PROFILE_DIR/artss-ci.mobileprovision"
  done
  bundle exec ruby -rjson -rxcodeproj -e '
    config = JSON.parse(File.read(ENV.fetch("SIGN_DIR") + "/settings.json"))
    project = Xcodeproj::Project.open("ios/ARTSSNative.xcodeproj")
    target = project.targets.find { |t| t.name == "ARTSSNative" } or abort "App target missing"
    target.build_configurations.each { |c| config.each { |k,v| c.build_settings[k] = v } }
    project.save
  '
  xcodebuild -workspace ios/ARTSSNative.xcworkspace -scheme ARTSSNative -configuration Release -destination 'generic/platform=iOS' -archivePath "$BUILD_DIR/ARTSS.xcarchive" archive
  xcodebuild -exportArchive -archivePath "$BUILD_DIR/ARTSS.xcarchive" -exportPath "$BUILD_DIR/ipa" -exportOptionsPlist "$SIGN_DIR/ExportOptions.plist"
else
  xcodebuild -workspace ios/ARTSSNative.xcworkspace -scheme ARTSSNative -configuration Release -destination 'generic/platform=iOS' -archivePath "$BUILD_DIR/ARTSS.xcarchive" CODE_SIGNING_ALLOWED=NO archive
  mkdir -p "$BUILD_DIR/package/Payload"
  cp -R "$BUILD_DIR/ARTSS.xcarchive/Products/Applications/ARTSSNative.app" "$BUILD_DIR/package/Payload/"
  (cd "$BUILD_DIR/package" && zip -qry "$BUILD_DIR/ipa/ARTSS-UNSIGNED.ipa" Payload)
fi
