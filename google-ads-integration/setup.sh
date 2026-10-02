#!/usr/bin/env bash
# Local one-time setup for the Google Ads API integration.
# Run this ON YOUR OWN MACHINE from inside google-ads-integration/.
set -euo pipefail

cd "$(dirname "$0")"

mkdir -p credentials
chmod 700 credentials

python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

echo
echo "Setup complete."
echo "Next steps:"
echo "  1. Copy your downloaded OAuth Desktop App JSON into ./credentials/"
echo "  2. source venv/bin/activate"
echo "  3. python generate_refresh_token.py --client-secrets credentials/<your-file>.json"
echo "  4. cp google-ads.yaml.example google-ads.yaml and fill in the values it prints"
echo "  5. python connection_test.py"
echo "  6. python list_campaigns.py 4546295798"
