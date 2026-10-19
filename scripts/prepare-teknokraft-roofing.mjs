// Offline only: generates reviewable SQL, never connects to a database.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseCsvRows } from "../src/lib/leadgen-csv.ts";
import { parseAddressComponents } from "../src/lib/address-parser.ts";
import { websiteOpportunity } from "../src/lib/leadgen-website-opportunity.ts";

export function prepareRoofingCsv(text) {
  const [headers, ...raw] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  for (const key of ["name", "phone", "website", "address", "category"])
    if (!headers?.includes(key))
      throw new Error(`Missing LeadSwift column: ${key}`);
  const gta = new Set([
    "toronto",
    "north york",
    "scarborough",
    "etobicoke",
    "york",
    "east york",
    "mississauga",
    "brampton",
    "caledon",
    "bolton",
    "vaughan",
    "woodbridge",
    "maple",
    "concord",
    "richmond hill",
    "markham",
    "thornhill",
    "aurora",
    "newmarket",
    "king city",
    "king",
    "whitchurch-stouffville",
    "stouffville",
    "east gwillimbury",
    "georgina",
    "keswick",
    "oakville",
    "burlington",
    "milton",
    "halton hills",
    "georgetown",
    "acton",
    "pickering",
    "ajax",
    "whitby",
    "oshawa",
    "clarington",
    "bowmanville",
    "courtice",
    "uxbridge",
    "scugog",
    "port perry",
    "brock",
    "beaverton",
  ]);
  return raw.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`Malformed CSV row ${index + 2}`);
    const source = Object.fromEntries(
      headers.map((h, i) => [h, values[i]?.trim() ?? ""]),
    );
    const address = parseAddressComponents(source.address);
    const phoneKey = source.phone
      .replace(/\D/g, "")
      .replace(/^1(?=\d{10}$)/, "");
    const phone = /^\d{10}$/.test(phoneKey)
      ? `+1${phoneKey}`
      : source.phone || null;
    const review = [];
    if (!source.name) review.push("Business name missing");
    if (!/^\d{10}$/.test(phoneKey)) review.push("Phone verification needed");
    if (!/(roof|dachdecker)/i.test(source.category))
      review.push("Roofing industry verification needed");
    if (address.province !== "ON" || !gta.has(address.city.toLowerCase()))
      review.push("Toronto / GTA location verification needed");
    let websiteKey = "";
    const opportunity = websiteOpportunity(source.website);
    if (opportunity === "rebranding")
      websiteKey = new URL(
        /^https?:\/\//i.test(source.website)
          ? source.website
          : `https://${source.website}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, "");
    return {
      n: index + 1,
      business_name: source.name,
      contact_name:
        [source.first_name, source.last_name].filter(Boolean).join(" ") || null,
      phone,
      phone_key: /^\d{10}$/.test(phoneKey) ? phoneKey : "",
      email: source.email || null,
      website: source.website || null,
      website_key: websiteKey,
      name_key: source.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
      street_address: source.address || null,
      city: address.city || null,
      province: address.province || null,
      postal_code: address.postalCode || null,
      country: address.country || null,
      industry: source.category || null,
      opportunity,
      review: review.join("; "),
      source,
    };
  });
}
export function buildRoofingSql(rows, filename) {
  const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const template = readFileSync(
    new URL("./teknokraft-roofing-template.sql", import.meta.url),
    "utf8",
  );
  return template
    .replace("/*SOURCE_JSON*/", quote(JSON.stringify(rows)))
    .replaceAll("/*SOURCE_FILENAME*/", quote(basename(filename)));
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: node scripts/prepare-teknokraft-roofing.mjs source.csv /tmp/teknokraft-roofing.sql",
    );
  const rows = prepareRoofingCsv(readFileSync(input, "utf8"));
  writeFileSync(output, buildRoofingSql(rows, input));
  console.log(
    JSON.stringify(
      {
        sourceRows: rows.length,
        readyBeforeDatabaseDedup: rows.filter((r) => !r.review).length,
        adminReviewBeforeDatabaseDedup: rows.filter((r) => r.review).length,
        websiteCategories: Object.fromEntries(
          ["rebranding", "new_website", "verification_needed"].map((key) => [
            key,
            rows.filter((r) => r.opportunity === key).length,
          ]),
        ),
      },
      null,
      2,
    ),
  );
}
