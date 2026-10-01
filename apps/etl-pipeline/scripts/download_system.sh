#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../data/raw/system"

# Load local .env if it exists
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  set -a
  source "${SCRIPT_DIR}/../.env"
  set +a
fi

echo "==> Preparing SYSTEM dataset directory..."
mkdir -p "${RAW_DIR}"

if [ -n "${PREBUILT_SYSTEM_CATALOG_URL:-}" ]; then
  echo "[!] PREBUILT_SYSTEM_CATALOG_URL is set. Skipping system CSV downloads."
  exit 0
fi

SYSTEM_INGREDIENTS_URL="${SYSTEM_INGREDIENTS_URL:-YOUR_SYSTEM_INGREDIENTS_URL_HERE}"
SYSTEM_PORTIONS_URL="${SYSTEM_PORTIONS_URL:-YOUR_SYSTEM_PORTIONS_URL_HERE}"

if [[ "${SYSTEM_INGREDIENTS_URL}" == "YOUR_"* ]] || [[ "${SYSTEM_PORTIONS_URL}" == "YOUR_"* ]]; then
  if [ -f "${RAW_DIR}/system_ingredients.csv" ]; then
    echo "[!] URL for SYSTEM datasets not configured, but local files found in raw/system/."
    echo "    Skipping download. The pipeline will process your manually placed files."
    exit 0
  else
    echo "[!] WARNING: URL for SYSTEM datasets are not configured."
    echo "    Skipping system data download. An empty catalog_system.ndjson will be generated."
    exit 0
  fi
fi

echo "==> Downloading SYSTEM Ingredients..."
if [[ "${SYSTEM_INGREDIENTS_URL}" == file://* ]]; then
  SRC_PATH="${SYSTEM_INGREDIENTS_URL#file://}"
  if [ "$(realpath "$SRC_PATH")" != "$(realpath "${RAW_DIR}/system_ingredients.csv")" ]; then
    cp "$SRC_PATH" "${RAW_DIR}/system_ingredients.csv"
  fi
else
  curl -L -f -sS --retry 3 -o "${RAW_DIR}/system_ingredients.csv" "${SYSTEM_INGREDIENTS_URL}" || {
    echo "[!] WARNING: Failed to download SYSTEM ingredients from ${SYSTEM_INGREDIENTS_URL}."
    echo "    Skipping. An empty catalog_system.ndjson will be generated."
    exit 0
  }
fi

echo "==> Downloading SYSTEM Portions..."
if [[ "${SYSTEM_PORTIONS_URL}" == file://* ]]; then
  SRC_PATH="${SYSTEM_PORTIONS_URL#file://}"
  if [ "$(realpath "$SRC_PATH")" != "$(realpath "${RAW_DIR}/system_portions.csv")" ]; then
    cp "$SRC_PATH" "${RAW_DIR}/system_portions.csv"
  fi
else
  curl -L -f -sS --retry 3 -o "${RAW_DIR}/system_portions.csv" "${SYSTEM_PORTIONS_URL}" || {
    echo "[!] WARNING: Failed to download SYSTEM portions from ${SYSTEM_PORTIONS_URL}."
    echo "    Skipping. An empty catalog_system.ndjson will be generated."
    exit 0
  }
fi

echo "==> SYSTEM datasets downloaded successfully!"
