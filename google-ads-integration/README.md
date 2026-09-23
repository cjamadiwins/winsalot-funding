# Google Ads API integration (Winsalot Corp) — read-only

Scaffolding for a secure, read-only Google Ads API connection. **Everything in
this guide runs on your own machine, not in any cloud/CI environment** —
generating an OAuth refresh token requires your local browser and your
personal Google login, and none of that should ever pass through a shared or
remote system.

Account info (non-secret):
- Manager account (`login_customer_id`): `6624026282`
- Client account under test: `4546295798`

## Security rules this integration follows

- The developer token, OAuth client secret, refresh token, and the contents
  of any downloaded JSON credential file are never printed or logged by any
  script here.
- `credentials/`, `google-ads.yaml`, `client_secret*.json`, `credentials*.json`,
  and `token*.json` are all gitignored (see repo root `.gitignore`) — do not
  remove those entries, and double-check `git status` before any commit shows
  none of those files as staged.
- Every script here is read-only. Nothing calls a Mutate service. Nothing can
  create, modify, pause, enable, or delete a campaign, ad, keyword,
  conversion, budget, location, or account setting.
- Nothing here asks for or touches your Google password or 2FA code — OAuth
  consent happens in your own browser, directly with Google.

## One-time local setup

```bash
cd google-ads-integration
./setup.sh
```

This creates `credentials/` (mode 700, local only, gitignored), a Python
virtualenv, and installs the official `google-ads` PyPI package.

## Step-by-step

1. **Get your OAuth Desktop App JSON.** In Google Cloud Console, under the
   project tied to your Google Ads developer token, create (or locate) an
   OAuth Client ID of type "Desktop app" and download its JSON. It typically
   lands in your Downloads folder as something like
   `client_secret_....apps.googleusercontent.com.json`.
2. Move (don't copy-and-leave-a-duplicate-in-Downloads, your choice) that
   file into `google-ads-integration/credentials/`.
3. Activate the venv and generate a refresh token:
   ```bash
   source venv/bin/activate
   python generate_refresh_token.py --client-secrets credentials/<your-file>.json
   ```
   This opens a browser tab on **your** machine pointed at Google's consent
   screen. Approve access yourself. The script prints only the resulting
   refresh token — copy it.
4. ```bash
   cp google-ads.yaml.example google-ads.yaml
   ```
   Edit `google-ads.yaml` and fill in:
   - `developer_token` — from the manager account's API Center
   - `client_id` / `client_secret` — from the same JSON file (open it
     yourself; this repo's scripts won't print its contents)
   - `refresh_token` — from step 3
   - `login_customer_id` — already set to `6624026282`
5. Read-only connection test + list accessible accounts:
   ```bash
   python connection_test.py
   ```
6. List campaigns and statuses for the client account:
   ```bash
   python list_campaigns.py 4546295798
   ```

## If you see a Test Account Access restriction

Both `connection_test.py` and `list_campaigns.py` detect this case and print
a clear message instead of a raw API error: if your developer token currently
has **Test Account Access** only, it can query Google Ads *test* accounts but
not the real manager/client accounts above. The fix is to apply for Basic or
Standard access in the API Center — these scripts will not attempt to work
around the restriction.

## Files

| File | Purpose |
|---|---|
| `setup.sh` | Creates `credentials/`, the venv, installs dependencies |
| `generate_refresh_token.py` | Desktop-app OAuth flow, run locally, opens your browser |
| `google-ads.yaml.example` | Template — copy to `google-ads.yaml` and fill in locally |
| `connection_test.py` | Read-only: verifies auth, lists accessible customer IDs |
| `list_campaigns.py <customer_id>` | Read-only: GAQL query for campaign id/name/status |
| `credentials/` | Local-only, gitignored — put your downloaded JSON here |
