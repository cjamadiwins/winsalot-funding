#!/usr/bin/env python3
"""Read-only Google Ads API connection test.

Loads credentials from ./google-ads.yaml (never printed) and calls
CustomerService.list_accessible_customers, which performs no writes and
cannot affect any campaign, ad, keyword, budget, or account setting.

Usage:
    python connection_test.py
"""

import sys

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CONFIG_PATH = "google-ads.yaml"


def main() -> int:
    try:
        client = GoogleAdsClient.load_from_storage(CONFIG_PATH)
    except FileNotFoundError:
        print(f"Missing {CONFIG_PATH}. Copy google-ads.yaml.example to {CONFIG_PATH} "
              "and fill in the values first.")
        return 1

    customer_service = client.get_service("CustomerService")

    try:
        response = customer_service.list_accessible_customers()
    except GoogleAdsException as ex:
        _report_google_ads_exception(ex)
        return 1

    resource_names = list(response.resource_names)
    if not resource_names:
        print("Connected, but no accessible customers were returned.")
        return 0

    print(f"Connection OK. {len(resource_names)} accessible customer(s):")
    for resource_name in resource_names:
        # resource_name looks like "customers/1234567890"
        customer_id = resource_name.split("/")[-1]
        print(f"  - {customer_id}")
    return 0


def _report_google_ads_exception(ex: GoogleAdsException) -> None:
    """Print failure details without ever echoing credential values."""
    messages = [error.message for error in ex.failure.errors]
    combined = " ".join(messages)

    if "test account" in combined.lower() or "TEST_ACCOUNT" in combined:
        print("RESTRICTED: this developer token currently has Test Account "
              "Access only. It can only query Google Ads test accounts, not "
              "the real manager/client accounts. Apply for Basic or Standard "
              "access in the API Center before continuing. Not attempting to "
              "bypass this restriction.")
        return

    print(f"Google Ads API request failed (request id: {ex.request_id}):")
    for message in messages:
        print(f"  - {message}")


if __name__ == "__main__":
    sys.exit(main())
