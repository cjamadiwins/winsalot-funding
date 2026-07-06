const NAV_LINKS = [
  { label: "Revenue Financing", href: "#revenue-advance" },
  { label: "Line of Capital", href: "#capital-line" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
];

export default function Nav() {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-6 px-8 py-[18px] sm:px-14 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="flex flex-none items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winsalot-logo.png" alt="Winsalot Corp" className="h-16 w-auto flex-none" />
      </div>
      <div className="flex flex-wrap items-center gap-8 text-[14.5px] font-medium text-[var(--color-ink-mute)]">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="whitespace-nowrap hover:text-[var(--color-ink)] transition-colors">
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex flex-none items-center gap-5">
        <span className="whitespace-nowrap text-[14.5px] font-medium text-[var(--color-ink-mute)] cursor-pointer hover:text-[var(--color-ink)] transition-colors">
          Log In
        </span>
        <a
          href="#apply"
          className="whitespace-nowrap rounded-full bg-[var(--color-ink)] px-[22px] py-[11px] text-[14.5px] font-semibold text-[var(--color-text-on-dark)] hover:opacity-90 transition-opacity"
        >
          Apply Now
        </a>
      </div>
    </div>
  );
}
