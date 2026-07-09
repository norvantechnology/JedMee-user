#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  JedMee - Build & Deploy Script
#  Usage:  ./deploy-apk.sh [--android] [--ios] [--all]
#  Default (no flags): builds Android only
#
#  What it does:
#    1. Builds Flutter release APK (Android) and/or IPA (iOS)
#    2. Compresses the APK into a zip file
#    3. Copies APK / ZIP / IPA to frontend/public/downloads/
#    4. Writes version.json so the website shows correct version + download URLs
#    5. Cleans up old versioned files from previous builds
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"
DOWNLOADS_DIR="$SCRIPT_DIR/frontend/public/downloads"

# ── Flags ───────────────────────────────────────────────────────────────────
BUILD_ANDROID=true
BUILD_IOS=false

for arg in "$@"; do
  case "$arg" in
    --android) BUILD_ANDROID=true ;;
    --ios)     BUILD_IOS=true; BUILD_ANDROID=false ;;
    --all)     BUILD_ANDROID=true; BUILD_IOS=true ;;
    --help|-h)
      echo "Usage: $0 [--android] [--ios] [--all]"
      echo "  --android  Build Android APK only (default)"
      echo "  --ios      Build iOS IPA only (requires macOS + Xcode)"
      echo "  --all      Build both Android APK and iOS IPA"
      exit 0 ;;
    *) warn "Unknown flag: $arg (ignored)" ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        JedMee Build & Deploy Pipeline            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Pre-flight checks ────────────────────────────────────────────────────────
command -v flutter >/dev/null 2>&1 || error "Flutter not found. Install Flutter SDK first."
command -v zip     >/dev/null 2>&1 || error "'zip' not found. Install it: sudo apt install zip"

if $BUILD_IOS; then
  [[ "$(uname)" == "Darwin" ]] || error "iOS builds require macOS with Xcode installed."
  command -v xcodebuild >/dev/null 2>&1 || error "Xcode not found. Install Xcode from the App Store."
fi

[[ -d "$MOBILE_DIR" ]]              || error "Mobile directory not found: $MOBILE_DIR"
[[ -f "$MOBILE_DIR/pubspec.yaml" ]] || error "pubspec.yaml not found in $MOBILE_DIR"

# ── Read version from pubspec.yaml ───────────────────────────────────────────
VERSION_LINE=$(grep '^version:' "$MOBILE_DIR/pubspec.yaml" | head -1)
VERSION_FULL=$(echo "$VERSION_LINE" | sed 's/version: *//')
VERSION_NAME=$(echo "$VERSION_FULL" | cut -d'+' -f1)   # e.g. 1.0.0
VERSION_CODE=$(echo "$VERSION_FULL" | cut -d'+' -f2)   # e.g. 1
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_DATE_HUMAN=$(date -u +"%B %d, %Y")

info "App version : $VERSION_NAME (build $VERSION_CODE)"
info "Build date  : $BUILD_DATE_HUMAN"

# ── Ensure downloads directory exists ────────────────────────────────────────
mkdir -p "$DOWNLOADS_DIR"

# ── Clean old versioned files ─────────────────────────────────────────────────
info "Cleaning old build artifacts from downloads/..."
rm -f "$DOWNLOADS_DIR"/jedmee-v*.apk \
      "$DOWNLOADS_DIR"/jedmee-v*.zip \
      "$DOWNLOADS_DIR"/jedmee-v*.ipa \
      "$DOWNLOADS_DIR"/jedmee-latest.apk \
      "$DOWNLOADS_DIR"/jedmee-latest.zip \
      "$DOWNLOADS_DIR"/jedmee-latest.ipa

# ════════════════════════════════════════════════════════════════════════════
#  ANDROID BUILD
# ════════════════════════════════════════════════════════════════════════════
ANDROID_APK_DEST=""
ANDROID_ZIP_DEST=""
ANDROID_SIZE_MB="0"
ANDROID_AVAILABLE="false"

if $BUILD_ANDROID; then
  echo ""
  info "━━━ Building Android APK (release) ━━━"

  cd "$MOBILE_DIR"

  info "Cleaning previous build..."
  flutter clean 2>&1 | grep -v "^$" | tail -3 || true

  info "Fetching dependencies..."
  flutter pub get 2>&1 | grep -v "^$" | tail -3 || true

  info "Building release APK (split-per-abi + obfuscate)..."
  DEBUG_INFO_DIR="$MOBILE_DIR/build/debug-info"
  mkdir -p "$DEBUG_INFO_DIR"
  flutter build apk --release --no-pub \
    --split-per-abi \
    --obfuscate \
    --split-debug-info="$DEBUG_INFO_DIR" \
    2>&1 | tail -6 || true

  # Prefer arm64-v8a; fall back to armeabi-v7a
  ARM64_APK="$MOBILE_DIR/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk"
  ARMV7_APK="$MOBILE_DIR/build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk"

  if [[ -f "$ARM64_APK" ]]; then
    SELECTED_APK="$ARM64_APK"; ARCH_LABEL="arm64-v8a"
  elif [[ -f "$ARMV7_APK" ]]; then
    SELECTED_APK="$ARMV7_APK"; ARCH_LABEL="armeabi-v7a"
  else
    error "APK build failed - no split APK found in build/app/outputs/flutter-apk/"
  fi

  success "APK built [$ARCH_LABEL]"

  APK_NAME="jedmee-v${VERSION_NAME}.apk"
  ZIP_NAME="jedmee-v${VERSION_NAME}.zip"
  ANDROID_APK_DEST="$DOWNLOADS_DIR/$APK_NAME"
  ANDROID_ZIP_DEST="$DOWNLOADS_DIR/$ZIP_NAME"

  # Copy APK
  cp "$SELECTED_APK" "$ANDROID_APK_DEST"

  # Compress into zip
  info "Compressing APK..."
  cd "$DOWNLOADS_DIR"
  zip -9 -j "$ZIP_NAME" "$APK_NAME" 2>/dev/null
  cd "$SCRIPT_DIR"

  # Also copy as "latest" for convenience
  cp "$ANDROID_APK_DEST" "$DOWNLOADS_DIR/jedmee-latest.apk"
  cp "$ANDROID_ZIP_DEST" "$DOWNLOADS_DIR/jedmee-latest.zip"

  APK_BYTES=$(wc -c < "$ANDROID_APK_DEST")
  ZIP_BYTES=$(wc -c < "$ANDROID_ZIP_DEST")
  ANDROID_SIZE_MB=$(echo "scale=1; $ZIP_BYTES / 1048576" | bc)
  ANDROID_AVAILABLE="true"

  success "APK  → $APK_NAME  ($(echo "scale=1; $APK_BYTES / 1048576" | bc) MB)"
  success "ZIP  → $ZIP_NAME  ($ANDROID_SIZE_MB MB compressed)"
fi

# ════════════════════════════════════════════════════════════════════════════
#  iOS BUILD  (macOS + Xcode only)
# ════════════════════════════════════════════════════════════════════════════
IOS_IPA_DEST=""
IOS_SIZE_MB="0"
IOS_AVAILABLE="false"

if $BUILD_IOS; then
  echo ""
  info "━━━ Building iOS IPA (release) ━━━"

  cd "$MOBILE_DIR"

  info "Cleaning previous build..."
  flutter clean 2>&1 | grep -v "^$" | tail -3 || true

  info "Fetching dependencies..."
  flutter pub get 2>&1 | grep -v "^$" | tail -3 || true

  info "Building iOS release IPA..."
  flutter build ipa --release --no-pub --export-method=ad-hoc 2>&1 | tail -6 || true

  IPA_SRC=$(find "$MOBILE_DIR/build/ios/ipa" -name "*.ipa" 2>/dev/null | head -1)
  if [[ -z "$IPA_SRC" ]]; then
    warn "IPA not found - iOS build may have failed. Skipping iOS deployment."
  else
    IPA_NAME="jedmee-v${VERSION_NAME}.ipa"
    IOS_IPA_DEST="$DOWNLOADS_DIR/$IPA_NAME"
    cp "$IPA_SRC" "$IOS_IPA_DEST"
    cp "$IOS_IPA_DEST" "$DOWNLOADS_DIR/jedmee-latest.ipa"

    IPA_BYTES=$(wc -c < "$IOS_IPA_DEST")
    IOS_SIZE_MB=$(echo "scale=1; $IPA_BYTES / 1048576" | bc)
    IOS_AVAILABLE="true"

    success "IPA  → $IPA_NAME  ($IOS_SIZE_MB MB)"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
#  WRITE version.json
# ════════════════════════════════════════════════════════════════════════════
echo ""
info "Writing version.json..."

# Determine APK/ZIP URLs - use versioned filename directly (no symlink dependency)
ANDROID_APK_URL="/downloads/jedmee-v${VERSION_NAME}.apk"
ANDROID_ZIP_URL="/downloads/jedmee-v${VERSION_NAME}.zip"
IOS_IPA_URL="/downloads/jedmee-v${VERSION_NAME}.ipa"

cat > "$DOWNLOADS_DIR/version.json" <<EOF
{
  "version": "$VERSION_NAME",
  "versionCode": "$VERSION_CODE",
  "buildDate": "$BUILD_DATE",
  "buildDateHuman": "$BUILD_DATE_HUMAN",
  "android": {
    "available": $ANDROID_AVAILABLE,
    "apkUrl": "$ANDROID_APK_URL",
    "zipUrl": "$ANDROID_ZIP_URL",
    "fileName": "jedmee-v${VERSION_NAME}.apk",
    "zipName": "jedmee-v${VERSION_NAME}.zip",
    "sizeMB": "$ANDROID_SIZE_MB"
  },
  "ios": {
    "available": $IOS_AVAILABLE,
    "ipaUrl": "$IOS_IPA_URL",
    "fileName": "jedmee-v${VERSION_NAME}.ipa",
    "sizeMB": "$IOS_SIZE_MB"
  }
}
EOF

success "version.json written."

# ════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║              Deploy Complete ✓                   ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Version   : ${BOLD}$VERSION_NAME${RESET} (build $VERSION_CODE)"
echo -e "  Date      : $BUILD_DATE_HUMAN"
if [[ "$ANDROID_AVAILABLE" == "true" ]]; then
  echo -e "  Android   : ${GREEN}✓${RESET} jedmee-v${VERSION_NAME}.apk + .zip ($ANDROID_SIZE_MB MB)"
fi
if [[ "$IOS_AVAILABLE" == "true" ]]; then
  echo -e "  iOS       : ${GREEN}✓${RESET} jedmee-v${VERSION_NAME}.ipa ($IOS_SIZE_MB MB)"
fi
echo ""
echo -e "  Files in  : ${CYAN}$DOWNLOADS_DIR${RESET}"
echo ""
echo -e "  ${YELLOW}Next step:${RESET} Deploy the frontend to serve the new downloads."
echo ""