// Winsalot Growth CRM: "Web Design & Digital Services Prospecting" training
// module. A self-contained, read-only reference section covering how
// agents should approach web design/development agencies, digital
// marketing/branding/SEO agencies, and freelance web builders - kept
// entirely separate from the generic Connect -> Propose -> Close course
// and from the DB-backed "Sales Training & Call Scripts" library above it.

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
      {children}
    </div>
  );
}

function ScriptBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
      <p className="mb-1 not-italic text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

const TARGET_AUDIENCE = [
  "Web design agencies",
  "Web development companies",
  "Digital marketing agencies",
  "Branding agencies",
  "SEO agencies that also provide website services",
  "Freelance web designers and developers",
  "E-commerce website developers",
];

const OFFER_TOPICS = [
  "A brand-new website",
  "Website redesign",
  "Website modernization",
  "Rebranding",
  "E-commerce website development",
  "Improving an outdated website",
  "Better website conversion or online presence",
];

const QUALIFICATION_QUESTIONS = [
  "What type of businesses are your ideal clients?",
  "What geographic areas do you serve?",
  "What is your typical website project value?",
  "Are you currently looking to take on more website projects?",
  "Approximately how many new projects could you handle each month?",
  "Do you mainly build new websites, redesign existing websites, or both?",
];

const AGENT_GOALS = [
  "Is actively looking for new business clients",
  "Has capacity to accept additional projects",
  "Has a clear target market",
  "Would benefit from Winsalot Corp generating qualified appointments for them",
  "Is interested in discussing the service further",
];

const NOTE_CHECKLIST = [
  "Services the agency provides",
  "Ideal client",
  "Geographic target",
  "Typical project value if provided",
  "Number of clients/projects they want",
  "Level of interest",
  "Any requested follow-up date",
];

const OBJECTIONS: { objection: string; response: string }[] = [
  {
    objection: "“We already get referrals.”",
    response:
      "“That’s great. We’re not looking to replace your referrals. We help create an additional outbound source of qualified business opportunities so you’re not relying on referrals alone.”",
  },
  {
    objection: "“We already run ads.”",
    response:
      "“That makes sense. Our service is different because we proactively reach out to businesses and work to generate qualified B2B appointments for your team.”",
  },
  {
    objection: "“We’re not looking right now.”",
    response: "“No problem. Would it be okay if we follow up when you’re ready to take on additional projects?”",
  },
  {
    objection: "“How much does it cost?”",
    response:
      "“Pricing depends on the campaign, target market, and number of appointments you’re looking for. We normally first understand what type of businesses you want to reach and then determine the best campaign structure.”",
  },
];

export default function WebDesignProspectingTrainingContent() {
  return (
    <div id="web-design-prospecting" className="scroll-mt-6 space-y-6">
      <Card>
        <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
          Web Design &amp; Digital Services Prospecting
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          A dedicated training section for prospecting web designers, web development agencies,
          digital marketing agencies, branding agencies, SEO agencies, and freelancers who build
          websites. Keep this page open while making calls in this niche.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Purpose</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          Winsalot Corp helps website and digital service providers generate qualified B2B
          appointments with businesses that may need a new website, website redesign, e-commerce
          website, or rebranding of their existing online presence.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Calling Scripts</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Read these scripts as written, filling in the bracketed agent name.
        </p>

        <ScriptBlock label="Primary Calling Script">
          <p>
            &ldquo;Hi, this is [Agent Name] from Winsalot Corp. We help service businesses
            generate qualified B2B appointments. I&rsquo;m reaching out because we work with
            companies that provide website and digital services, and I wanted to see if
            you&rsquo;re currently looking to add more business clients.&rdquo;
          </p>
        </ScriptBlock>

        <ScriptBlock label="Alternate Calling Script">
          <p>
            &ldquo;Hi, this is [Agent Name] from Winsalot Corp. We&rsquo;re calling because we can
            help generate appointments with businesses that are looking to create a new website,
            redesign an existing website, or rebrand their online presence. Are you currently
            looking to take on more website projects?&rdquo;
          </p>
        </ScriptBlock>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Who Agents Should Target</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {TARGET_AUDIENCE.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">What Winsalot Corp Is Offering</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          Agents should explain that Winsalot Corp provides B2B lead generation and
          appointment-setting services. The objective is to connect the website company with
          businesses interested in discussing:
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {OFFER_TOPICS.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Qualification Questions</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">If the prospect is interested, agents should ask:</p>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-ink)]">
          {QUALIFICATION_QUESTIONS.map((question, i) => (
            <li key={question} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <span className="font-semibold text-[var(--color-ink-strong)]">{i + 1}. </span>
              &ldquo;{question}&rdquo;
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Agent Goal</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          The goal is not simply to sell on the first call. The goal is to determine whether the
          website or digital agency:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm leading-6 text-[var(--color-ink)]">
          {AGENT_GOALS.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[var(--color-accent)]">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">If They Show Interest</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          Agents should move the prospect into the appropriate interested/opportunity workflow in
          the Growth CRM and book a consultation when appropriate. Agents should leave clear notes
          including:
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {NOTE_CHECKLIST.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Common Objection Responses</h2>
        <div className="mt-3 space-y-3">
          {OBJECTIONS.map(({ objection, response }) => (
            <div key={objection} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm leading-6">
              <p className="font-semibold text-[var(--color-ink-strong)]">{objection}</p>
              <p className="mt-1.5 italic text-[var(--color-ink)]">{response}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-accent-soft-text)]">
            Important Agent Training Note
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-accent-soft-text)]">
            Agents should never promise a specific number of customers or guarantee that an
            appointment will become a sale. Winsalot Corp generates and qualifies opportunities
            and appointments; the client is responsible for presenting their website services and
            closing the business.
          </p>
        </div>
      </Card>
    </div>
  );
}
