import "server-only";
import { escapeHtml } from "./html";
import { getSiteUrl } from "./site-url";

// Branded Winsalot Corp. client update email (same look as the receipt email;
// existing /winsalot-logo.png). `message` is plain text: blank lines become
// paragraphs, lines starting with "• " or "- " become a bullet list.
export function renderClientUpdateEmail(subject: string, message: string): { subject: string; text: string; html: string } {
  const logoUrl = `${getSiteUrl()}/winsalot-logo.png`;
  const isBullet = (line: string) => /^\s*[•-]\s+/.test(line);
  const paragraph = (lines: string[]) =>
    `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">${lines.map(escapeHtml).join("<br>")}</p>`;
  const bulletList = (lines: string[]) => {
    const items = lines.map((line) => `<li style="margin:0 0 4px;">${escapeHtml(line.replace(/^\s*[•-]\s+/, ""))}</li>`).join("");
    return `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#374151;">${items}</ul>`;
  };

  // Within a block, consecutive bullet lines become a real list and the lines
  // around them stay paragraphs (so "Here is a summary:" + bullets works).
  const body = message
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const parts: string[] = [];
      let run: string[] = [];
      let runIsBullets = false;
      const flush = () => {
        if (run.length) parts.push(runIsBullets ? bulletList(run) : paragraph(run));
        run = [];
      };
      for (const line of block.split("\n")) {
        const bullet = isBullet(line);
        if (run.length && bullet !== runIsBullets) flush();
        runIsBullets = bullet;
        run.push(line);
      }
      flush();
      return parts.join("");
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1e3a8a;padding:20px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${logoUrl}" width="44" alt="Winsalot Corp." style="display:block;border:0;height:auto;"></td>
    <td style="padding-left:12px;color:#ffffff;font-size:22px;font-weight:700;">Winsalot Corp.</td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px;">${body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">
  Winsalot Corp. · Empowering Businesses, One Solution at a Time.<br>647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text: message.trim(), html };
}
