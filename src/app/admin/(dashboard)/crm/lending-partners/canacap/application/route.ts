import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireCrmAdmin } from "@/lib/crm-auth";

export const runtime = "nodejs";

// The original, unmodified four-page CanaCap Merchant Cash Advance
// application. It lives in lender-forms/ (not public/) so it is only
// reachable through this admin-gated route. It is a blank form - completed
// customer applications and bank statements never belong in the repo.
const PDF_PATH = path.join(process.cwd(), "lender-forms", "canacap", "CanaCap_MCA_Application.pdf");

// ?download=1 forces a save; otherwise it opens inline in the browser's
// PDF viewer, which also gives the admin its print button.
export async function GET(request: Request) {
  await requireCrmAdmin();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const file = await readFile(PDF_PATH);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="CanaCap_MCA_Application.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
