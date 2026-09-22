#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../data/raw/usda"

echo "==> Preparing USDA dataset directory..."
mkdir -p "${RAW_DIR}"

# ---------------------------------------------------------
# TO THE MAINTAINER:
# Insert the actual direct download URL for the USDA FoodData Central CSV.
# ---------------------------------------------------------
USDA_URL="YOUR_USDA_CSV_URL_HERE"

if [[ "${USDA_URL}" == "YOUR_"* ]]; then
  echo "[!] ERROR: URL for USDA is not configured."
  echo "    Please update the script with a valid URL or disable include_usda in the CI workflow."
  exit 1
fi

echo "==> Downloading USDA FoodData Central..."
curl -L -f -sS --retry 3 -o "${RAW_DIR}/usda.csv" "${USDA_URL}" || {
  echo "[!] FATAL ERROR: Failed to download USDA from ${USDA_URL}."
  echo "    The file may be inaccessible, or the URL might be outdated."
  exit 1
}

echo "==> USDA dataset step complete!"
