# Network allowlist request: Winsalot lead verification

Status: **pending approval**. Network Access stays **Limited**. Nothing has been changed.
Each host is listed bare and with `www` where relevant, because the proxy treats them as separate entries.

## Why the list is short
A business with **no website has no domain to allowlist**. Domains can only be requested for sites that
search or a directory has already surfaced. So the list has two parts: exact business sites already found,
and public directories that publish a business's website field (or its absence).

## Tier 1: exact business sites already surfaced (confirm website status of 2 rows)
| Domain | Business | Purpose |
|---|---|---|
| `thelandscapecompany.ca`, `www.thelandscapecompany.ca` | The Landscape Company Inc | Confirm site is real and belongs to this business, then reject the lead |
| `nortexroofing.com`, `www.nortexroofing.com` | Nortex Roofing Inc | Same. Phone on the site differs from 411.ca, so confirm identity |

(`pcl.com` is not requested: PCL is a large national contractor, already rejected.)

## Tier 2: public directories that publish website fields (for discovery and corroboration)
| Domain | Coverage | Why |
|---|---|---|
| `ww4.yorkmaps.ca` | York Region business directory | Government listing with address, phone and website field. Covers Markham, Vaughan, Richmond Hill |
| `directory.durham.ca`, `tourismdirectory.durham.ca` | Durham Region listings | Same for Pickering, Ajax, Whitby, Oshawa |
| `og.landscapeontario.com`, `landscapeontario.com` | Landscape Ontario member profiles | Member profiles list website, phone and address |
| `www.ohba.ca` | Ontario Home Builders' Association | Builder and renovator member directory |
| `www.starofservice.ca` | Free directory | Lists independent trades, often with no website |
| `websites.ca`, `www.websites.ca` | Directory of business sites | Shows whether a site exists |

## Not requested, with reasons
- `www.yp.ca` / YellowPages: terms prohibit automated collection.
- `www.yelp.ca`: terms restrict automated access.
- `www.facebook.com` / Instagram: terms restrict automated access and can expose personal data.
- Paid databases (Scott's Directories paid tiers, ZoomInfo): not approved.

## Limits to expect
- Tier 2 covers York and Durham well. **Toronto, Peel and Halton have no equivalent open directory here**, so
  leads in those areas will keep depending on search and may stay in manual review.
- When search surfaces another business's own domain, I will ask for it in a **small batch** instead of
  asking for broad access.
- Reaching 100 qualified leads is not assured. I will report the real count.

## Rules I will follow
Read-only GET requests, low rate, robots.txt respected, no logins, no forms, no outreach.
No CRM changes, no paid services, PR #477 not merged.
