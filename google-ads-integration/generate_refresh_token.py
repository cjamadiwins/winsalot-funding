#!/usr/bin/env python3
"""Generate an OAuth refresh token for the Google Ads API using the
desktop-app authorization flow. Run this locally — it opens your default
browser so you personally approve access on Google's consent screen.

Usage:
    python generate_refresh_token.py --client-secrets credentials/client_secret_XXXX.json

The script never prints the client secret. It prints only the resulting
refresh token, which you paste into google-ads.yaml yourself.
"""

import argparse

from google_auth_oauthlib.flow import InstalledAppFlow

# Read-only scope: sufficient for accessible-customers, GAQL search/search_stream.
# It cannot be used to mutate campaigns, budgets, keywords, etc.
SCOPES = ["https://www.googleapis.com/auth/adwords"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--client-secrets",
        required=True,
        help="Path to the OAuth Desktop App client secret JSON downloaded from "
        "Google Cloud Console (e.g. credentials/client_secret_....json).",
    )
    args = parser.parse_args()

    flow = InstalledAppFlow.from_client_secrets_file(args.client_secrets, scopes=SCOPES)

    # Opens a local browser tab pointed at Google's consent screen. You approve
    # (or deny) access there, in your own browser session — this script never
    # sees your Google password or 2FA code.
    credentials = flow.run_local_server(port=0)

    print("\nAuthorization complete.")
    print("Add this value to google-ads.yaml as `refresh_token` (keep it out of git):\n")
    print(credentials.refresh_token)


if __name__ == "__main__":
    main()
