const FOOTER_COLUMNS = [
  {
    heading: "Products",
    links: [
      { label: "Revenue Advance", href: "#revenue-advance" },
      { label: "Capital Line", href: "#capital-line" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#apply" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Use", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <div className="border-t border-[var(--color-border)] px-8 pb-10 pt-14 sm:px-14">
      <div className="mx-auto mb-10 flex max-w-[1200px] flex-col items-start justify-between gap-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/winsalot-logo.png" alt="Winsalot Corp" className="h-14 w-auto" />
        </div>
        <div className="flex flex-wrap gap-16 text-sm text-[var(--color-text-muted-2)] sm:gap-20">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-2.5">
              <div className="mb-1 font-semibold text-[var(--color-ink-strong)]">
                {col.heading}
              </div>
              {col.links.map((link) => (
                <a key={link.label} href={link.href} className="hover:text-[var(--color-ink)] transition-colors">
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] border-t border-[var(--color-border-soft)] pt-7 text-[13px] text-[var(--color-text-faint)]">
        © {new Date().getFullYear()} Winsalot Corp. All rights reserved. Funding
        amounts and terms subject to eligibility.
      </div>
    </div>
  );
}
