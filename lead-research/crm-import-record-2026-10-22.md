# CRM import record: website development leads for Goodness Ugbana (2026-10-22)

Approved by the account owner. Inserted directly into the Lead Generation CRM database (Supabase project
"Business Finance") because no CRM admin session was available. Insert-only; no existing row was changed.

## What was created
- Campaign: **Teknokraft — GTA Trades Website Development** (client Teknokraft Canada Inc., active), Goodness assigned.
- Call list 1: **Teknokraft GTA Trades — New Website — Verified — Goodness Ugbana**: 49 leads.
- Call list 2: **Teknokraft GTA Trades — New Website — Two-Source (Confirm First) — Goodness Ugbana**: 94 leads.
- Every lead is assigned to Goodness, DNC-clean, and tagged `extra_fields.import_batch = winsalot-website-leads-2026-10-22`.

## Counts
| | |
|---|---|
| Leads imported | 143 (all New Website; 0 Website Rebranding) |
| Assigned to Goodness | 143 |
| Duplicates excluded | 9 (3 verified group, 6 two-source group). Already in Goodness's lists: 8 Hidebrandt "Auto Repair — No Website" leads, 1 Teknokraft roofing lead (also has a call log) |
| Not imported, awaiting verification | 153 two-source leads outside the Top 100, plus 5 rebranding candidates (have a website that was never audited) |

## Checks done
- Duplicate screen against live `call_list_leads`, `leadgen_leads`, `leadgen_call_logs`, `leadgen_appointments`, `crm_dnc_suppressions`
  (by phone, and by name + city), run twice: before import and inside the import transaction.
- Row-by-row checksum of all 143 imported rows against the research data (one source link was mistyped on import and corrected).
- Goodness's existing campaigns (4) and the two existing roofing lists (332 and 233 leads) are unchanged.
- Visibility rule emulated for Goodness: list active, on its roster, campaign and list allowed for her.
  A real sign-in as Goodness was not performed.

## To reverse (admin only)
Delete `call_list_leads` where `extra_fields->>'import_batch' = 'winsalot-website-leads-2026-10-22'`, then the two segments and
their `call_list_segment_agents` rows, then the campaign's `leadgen_campaign_agents` row and the campaign.
