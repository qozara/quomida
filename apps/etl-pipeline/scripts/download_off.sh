#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${SCRIPT_DIR}/../data/raw/openfoodfacts"
GZ_FILE="${TARGET_DIR}/openfoodfacts-products.jsonl.gz"
DUMP_URL="https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz"

echo "==> Creating target directory: ${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"

echo "==> Downloading Open Food Facts JSONL dump robustly from ${DUMP_URL}..."
echo "    Using curl with resume (-C -) and retry logic."

# -L: Follow redirects
# -f: Fail fast on server errors
# -C -: Resume interrupted downloads automatically
# --retry 10: Retry up to 10 times on network failure
# --retry-delay 5: Wait 5 seconds between retries
curl -L -f -C - --retry 10 --retry-delay 5 --progress-bar "${DUMP_URL}" -o "${GZ_FILE}"

echo "==> Download complete!"
echo "==> We will NOT decompress the file."
echo "==> The Node.js ETL pipeline will stream and decompress the .gz file on-the-fly to save ~15GB of disk space."
