#!/usr/bin/env bash
set -euo pipefail

# Run this script from the DivyaDhara project root after copying the bundle's
# src/, server/, and env template directories into the project, or invoke the
# script with DIVYADHARA_PROJECT_ROOT=/path/to/project.

PROJECT_ROOT="${DIVYADHARA_PROJECT_ROOT:-$(pwd)}"
BUNDLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "ERROR: DivyaDhara project root not found: $PROJECT_ROOT"
  echo "Run from the project root or set DIVYADHARA_PROJECT_ROOT=/path/to/divyadhara-website"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split(\".\")[0]")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "ERROR: Current Firebase Admin Node.js SDK requires Node.js 22+. Detected: $(node -v)"
  exit 1
fi

cd "$PROJECT_ROOT"

echo "[1/5] Installing Firebase SDKs..."
npm install firebase firebase-admin

echo "[2/5] Installing Firebase source files..."
mkdir -p src/lib/firebase server/lib server/routes
cp "$BUNDLE_ROOT/src/lib/firebase/client.ts" src/lib/firebase/client.ts
cp "$BUNDLE_ROOT/src/lib/firebase/phoneAuth.ts" src/lib/firebase/phoneAuth.ts
cp "$BUNDLE_ROOT/src/lib/firebase/backend.ts" src/lib/firebase/backend.ts
cp "$BUNDLE_ROOT/server/lib/firebase-admin.ts" server/lib/firebase-admin.ts
cp "$BUNDLE_ROOT/server/routes/firebase-auth.ts" server/routes/firebase-auth.ts

echo "[3/5] Creating environment template..."
cp "$BUNDLE_ROOT/.env.firebase.example" .env.firebase.example

INDEX_FILE="server/index.ts"
IMPORT_LINE='import firebaseAuthRoutes from "./routes/firebase-auth.ts";'
AUTH_MOUNT='app.use("/api/auth", authRoutes);'
FIREBASE_MOUNT='app.use("/api/auth/firebase", firebaseAuthRoutes);'

if [[ ! -f "$INDEX_FILE" ]]; then
  echo "ERROR: $INDEX_FILE not found."
  exit 1
fi

if ! grep -Fq "$IMPORT_LINE" "$INDEX_FILE"; then
  python3 - "$INDEX_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = 'import authRoutes from "./routes/auth.ts";'
replacement = needle + '\nimport firebaseAuthRoutes from "./routes/firebase-auth.ts";'
if needle not in text:
    raise SystemExit("Could not find auth route import in server/index.ts")
path.write_text(text.replace(needle, replacement, 1))
PY
fi

if ! grep -Fq "$FIREBASE_MOUNT" "$INDEX_FILE"; then
  python3 - "$INDEX_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = 'app.use("/api/auth", authRoutes);'
replacement = needle + '\napp.use("/api/auth/firebase", firebaseAuthRoutes);'
if needle not in text:
    raise SystemExit("Could not find /api/auth mount in server/index.ts")
path.write_text(text.replace(needle, replacement, 1))
PY
fi

echo "[4/5] Verifying TypeScript..."
npx tsc --noEmit -p tsconfig.node.json

echo "[5/5] Firebase foundation installed successfully."
echo
echo "Next: fill .env with the Firebase Web + Admin values, then run:"
echo "  npm run dev"
echo
echo "The lead-capture UI/API is intentionally not wired yet; that is the next Phase-2 step."
