#!/usr/bin/env python3
"""Read-only listing of campaigns and their statuses for a Google Ads customer.

Uses GoogleAdsService.search, a read-only GAQL query. This script contains
no mutate calls and cannot create, modify, pause, enable, or delete anything.

Usage:
    python list_campaigns.py 4546295798
"""

import sys

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CONFIG_PATH = "google-ads.yaml"

QUERY = """
    SELECT
      campaign.id,
      campaign.name,
      campaign.status
    FROM campaign
    ORDER BY campaign.id
"""


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python list_campaigns.py <customer_id>")
        return 1
    customer_id = sys.argv[1].replace("-", "")

    try:
        client = GoogleAdsClient.load_from_storage(CONFIG_PATH)
    except FileNotFoundError:
        print(f"Missing {CONFIG_PATH}. Copy google-ads.yaml.example to {CONFIG_PATH} "
              "and fill in the values first.")
        return 1

    ga_service = client.get_service("GoogleAdsService")

    try:
        stream = ga_service.search_stream(customer_id=customer_id, query=QUERY)
        rows = 0
        for batch in stream:
            for row in batch.results:
                rows += 1
                print(f"  {row.campaign.id}  {row.campaign.status.name:12s}  {row.campaign.name}")
        if rows == 0:
            print(f"No campaigns found for customer {customer_id}.")
    except GoogleAdsException as ex:
        messages = [error.message for error in ex.failure.errors]
        combined = " ".join(messages)
        if "test account" in combined.lower() or "TEST_ACCOUNT" in combined:
            print("RESTRICTED: this developer token currently has Test Account "
                  "Access only, so it cannot query real customer accounts. "
                  "Apply for Basic or Standard access in the API Center before "
                  "continuing. Not attempting to bypass this restriction.")
            return 1
        print(f"Google Ads API request failed (request id: {ex.request_id}):")
        for message in messages:
            print(f"  - {message}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
