# Network allowlist request 2: expanding beyond York Region

Status: **pending approval**. Network Access stays **Limited**. Nothing has been changed.

## Why more access is needed
Every lead so far is in York Region (and 4 older ones elsewhere) because York publishes a free government
directory with phone and website fields. 411.ca is reachable for every city, but it is **one source**. A lead is
only counted as qualified when a **second independent source** agrees on name, phone and "no website".
Toronto, Peel, Halton and Durham have no second source I can reach, so those leads cannot be counted yet.

## What I tested (reachable now)
`www.411.ca`, `ww4.yorkmaps.ca`, `landscapeontario.com`, `www.ohba.ca`: reachable, already used or low value.
`websites.ca` is now just a web-design company (old listings gone). `www.starofservice.ca` returns empty pages to
automated requests, so it is not usable.

## Entries to add (ordered by expected value)

### Durham Region (Oshawa, Whitby, Ajax, Pickering, Clarington)
The Region publishes an official business directory with phone and website on each listing.
```
www.durham.ca
tourismdirectory2.durham.ca
```
Known problem: `directory.durham.ca` (where the individual listings live) serves a **mismatched TLS certificate**.
I will not bypass certificate checks. If that host stays broken, Durham stays blocked. Ask Durham Region to fix it.

### City of Toronto
Open-data business licence dataset (operating name, address, phone). It has **no website field** and covers only
licensed categories (not roofers, painters or landscapers), so it confirms existence and phone for a limited set.
```
open.toronto.ca
ckan0.cf.opendata.inter.prod-toronto.ca
```
The second host is the open-data download host as I understand it; I could not verify it from here.

### Mississauga
The City's open-data catalogue publishes a business directory with phone and website (about 16,000 businesses).
```
www.mississauga.ca
mississauga.ca
```
I could not confirm the exact open-data download host. If these two do not expose the dataset, tell me the
dataset's link and I will give you the exact host.

### Brampton, Oakville, Burlington, Milton
I found **no free municipal business directory** with website fields for these. Chambers of commerce publish
member directories, but members are a small subset. Burlington's is `www.burlingtonchamber.com`; I could not
confirm the others. I do not recommend adding anything here yet.

## Not requested
YellowPages / `yp.ca`, Yelp, Facebook and Instagram (terms restrict automated access); BBB (terms restrict
scraping); any paid database (for example Scott's Directories).

## Honest expectations
- Durham and Mississauga could add real leads. Toronto's dataset adds little for the target trades.
- Peel and Halton have no confirmed source, so 500 is **not assured** even with every entry above.
- Opportunity type "Website Rebranding" needs the business's own site opened; that needs each site's domain approved.
- The web-search tool cannot individually verify small shops: 32 of 32 searches found nothing either way.
  That is why this list asks for directories instead.
