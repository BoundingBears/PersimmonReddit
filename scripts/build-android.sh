#!/bin/bash
# Build the SPA and sync into the Android project. After this finishes, open
# Android Studio (`npx cap open android`) to actually produce the APK.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Building SvelteKit SPA…"
npm run build

echo "→ Syncing into android/…"
npx cap sync android

echo
echo "Done. Next steps:"
echo "  npx cap open android         # opens Android Studio"
echo "  ./gradlew assembleDebug      # if SDK is on PATH (in android/)"
