"use client";

import { useState } from "react";

type Props = {
  /** Which CRM this course is rendered in, so the Close module and a few
   * scenario CTAs can reference the right primary call-to-action. */
  crm: "leadgen" | "cleaning";
};

const PRIMARY_CTA: Record<Props["crm"], string> = {
  leadgen: "booking the free 15-minute consultation",
  cleaning: "completing the cleaning quote request (or the next specific step in the quote process)",
};

type Stage = "Connect" | "Propose" | "Close";

const STAGE_STYLES: Record<Stage, string> = {
  Connect: "bg-sky-100 text-sky-800",
  Propose: "bg-amber-100 text-amber-800",
  Close: "bg-emerald-100 text-emerald-800",
};

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_STYLES[stage]}`}>
      {stage}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
      {children}
    </div>
  );
}

const QUIZ_QUESTIONS: { question: string; options: string[]; correctIndex: number }[] = [
  {
    question: "What should you confirm first when somebody answers the phone?",
    options: ["Business name", "Your own name", "The weather", "Their budget"],
    correctIndex: 0,
  },
  {
    question: "Should you immediately begin pitching once someone answers?",
    options: ["Yes", "No"],
    correctIndex: 1,
  },
  {
    question: "When should you propose the solution?",
    options: [
      "Immediately after saying hello",
      "After understanding the prospect's situation or need",
      "Only if they ask",
      "Never",
    ],
    correctIndex: 1,
  },
  {
    question: "Should a qualified call end without attempting a CTA?",
    options: ["Yes", "No"],
    correctIndex: 1,
  },
  {
    question: "Is scheduling a specific follow-up considered a CTA?",
    options: ["Yes", "No"],
    correctIndex: 0,
  },
  {
    question: "What is the three-step framework?",
    options: [
      "Connect → Propose → Close",
      "Introduce → Sell → Close",
      "Call → Pitch → Book",
      "Listen → Talk → Ask",
    ],
    correctIndex: 0,
  },
];

export default function ConnectProposeCloseCourse({ crm }: Props) {
  const cta = PRIMARY_CTA[crm];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = QUIZ_QUESTIONS.reduce(
    (total, q, i) => (answers[i] === q.correctIndex ? total + 1 : total),
    0
  );
  const allAnswered = QUIZ_QUESTIONS.every((_, i) => answers[i] !== undefined);

  const scenarios: { prospectSays: string; agentResponse: string; stage: Stage; cta: string }[] = [
    {
      prospectSays: "“That actually sounds like something we could use.”",
      agentResponse: `“Great — based on what you've shared, this is exactly what we help with. Let's take the next step: ${cta}.”`,
      stage: "Close",
      cta: `Move straight to ${cta}.`,
    },
    {
      prospectSays: "“Can you just send me some information?”",
      agentResponse:
        "“Absolutely, I'll send that over now. While I have you, let's go ahead and lock in the next step so you don't have to remember to follow up.”",
      stage: "Close",
      cta: `Try to book ${cta} directly; if not, set a specific follow-up time.`,
    },
    {
      prospectSays: "“I'm in the middle of something right now.”",
      agentResponse:
        "“No problem at all — I'll be quick. Can I grab 30 seconds, or would it be better if I called back at a specific time today?”",
      stage: "Connect",
      cta: "A specific callback time.",
    },
    {
      prospectSays: "“We already work with another company for that.”",
      agentResponse:
        "“That's great to hear you have that covered. A lot of the businesses we work with kept their existing setup and still found it useful to compare notes. Would you be open to a short conversation?”",
      stage: "Propose",
      cta: `A soft ask for ${cta}.`,
    },
    {
      prospectSays: "“This is [Business Name], how can I help you?” (receptionist/gatekeeper)",
      agentResponse:
        "“Hi, could you connect me with the owner or the person who handles this?”",
      stage: "Connect",
      cta: "Get transferred to the decision maker, or get their name and the best time to reach them.",
    },
    {
      prospectSays: "“Let me think about it and get back to you.”",
      agentResponse:
        "“Of course — this is worth thinking through. So I don't lose track, let's set a specific time for me to follow up. Would Tuesday or Wednesday work?”",
      stage: "Close",
      cta: "A scheduled follow-up (still a valid CTA).",
    },
    {
      prospectSays: "“Yeah, let's go ahead and book it.”",
      agentResponse: "“Perfect — would Tuesday afternoon or Wednesday morning work better for you?”",
      stage: "Close",
      cta: "Confirm the specific date and time.",
    },
    {
      prospectSays: "“Call me back next week, I need to check my schedule.”",
      agentResponse:
        "“No problem — I'll follow up next week. Does Monday work, or would you prefer I email you a couple of time options first?”",
      stage: "Close",
      cta: "A locked-in follow-up date.",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
          Connect → Propose → Close
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          A simple, repeatable framework for handling prospect calls and always moving the
          conversation toward a clear Call to Action (CTA).
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Module 1 — Connect</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          The first objective is to make sure the agent is speaking to the correct business and
          person.
        </p>

        <ol className="mt-4 space-y-4 text-sm leading-6 text-[var(--color-ink)]">
          <li>
            <p className="font-semibold text-[var(--color-ink-strong)]">1. Confirm the business name</p>
            <p className="mt-1 italic">&ldquo;Hi, is this [Business Name]?&rdquo;</p>
            <p className="mt-1 text-[var(--color-text-muted)]">
              Do not begin the full pitch until the business has been confirmed.
            </p>
          </li>
          <li>
            <p className="font-semibold text-[var(--color-ink-strong)]">2. Introduce yourself</p>
            <p className="mt-1 italic">
              &ldquo;Great. My name is [Agent Name], calling from Winsalot Corp.&rdquo;
            </p>
          </li>
          <li>
            <p className="font-semibold text-[var(--color-ink-strong)]">3. Identify the right person</p>
            <p className="mt-1 italic">
              &ldquo;May I speak with the owner or the person responsible for [relevant area]?&rdquo;
            </p>
          </li>
          <li>
            <p className="font-semibold text-[var(--color-ink-strong)]">4. Start the conversation</p>
            <p className="mt-1 text-[var(--color-text-muted)]">
              Once the correct person is reached, briefly explain why you are calling and ask a
              question that gets the prospect talking.
            </p>
          </li>
        </ol>

        <div className="mt-4 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-4">
          <p className="text-sm font-bold text-[var(--color-accent-soft-text)]">
            KEY RULE: Connect = Confirm Business → Introduce Yourself → Confirm Decision Maker →
            Start Conversation
          </p>
          <p className="mt-1 text-sm text-[var(--color-accent-soft-text)]">
            Agents should LISTEN before proposing a solution.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Module 2 — Propose</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Do not immediately give a long sales pitch. The proposal should be based on what the
          prospect tells the agent.
        </p>

        <p className="mt-4 text-sm font-bold text-[var(--color-ink-strong)]">
          Simple formula: Prospect&apos;s Need → Our Solution → Benefit
        </p>

        <div className="mt-3 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm">
          <p>
            <span className="font-semibold text-[var(--color-ink-strong)]">Prospect: </span>
            &ldquo;We&apos;re looking for more customers.&rdquo;
          </p>
          <p>
            <span className="font-semibold text-[var(--color-ink-strong)]">Agent: </span>
            &ldquo;Understood. Based on what you&apos;ve mentioned, this may be something we can
            help you with. We help businesses create more sales opportunities and improve the
            process for bringing in new customers.&rdquo;
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-4">
          <p className="text-sm font-bold text-[var(--color-accent-soft-text)]">
            KEY RULE: Do not propose until you understand what the prospect needs.
          </p>
          <p className="mt-1 text-sm text-[var(--color-accent-soft-text)]">
            Keep the proposal short, relevant and conversational.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Module 3 — Close</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Every productive call should end with a clear Call to Action.
        </p>

        {crm === "leadgen" ? (
          <>
            <p className="mt-4 text-sm text-[var(--color-ink)]">
              For the Lead Generation CRM, the primary CTA is <strong>booking the 15-minute consultation</strong>.
            </p>
            <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic text-[var(--color-ink)]">
              &ldquo;The next step would be a quick 15-minute consultation. Let&apos;s get that
              scheduled. Would Tuesday afternoon or Wednesday morning work better?&rdquo;
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-[var(--color-ink)]">
              For the Winsalot Growth CRM, the CTA depends on the situation and may include:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink)]">
              <li>Completing the cleaning quote request</li>
              <li>Providing the information needed for a quote</li>
              <li>Receiving/sending the quote</li>
              <li>Scheduling a specific follow-up</li>
            </ul>
          </>
        )}

        <p className="mt-4 text-sm text-[var(--color-text-muted)]">Avoid weak closes such as:</p>
        <p className="mt-1 text-sm italic text-[var(--color-text-muted)]">
          &ldquo;Would you maybe be interested in booking?&rdquo;
        </p>
        <p className="mt-2 text-sm text-[var(--color-ink)]">
          Teach agents to confidently guide the prospect toward the next step.
        </p>

        <p className="mt-4 text-sm text-[var(--color-ink)]">If the prospect is not ready:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic text-[var(--color-ink)]">
          &ldquo;No problem. I can send you the information. When would be a good time for me to
          follow up with you?&rdquo;
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          A scheduled follow-up is also a valid CTA.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">The 3-Step Rule</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="font-bold text-sky-800">🔵 CONNECT</p>
            <p className="mt-1 text-sm text-sky-800">Confirm → Introduce → Ask → Listen</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-bold text-amber-800">🟡 PROPOSE</p>
            <p className="mt-1 text-sm text-amber-800">Need → Solution → Benefit</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-bold text-emerald-800">🟢 CLOSE</p>
            <p className="mt-1 text-sm text-emerald-800">CTA → Specific Next Step</p>
          </div>
        </div>
        <p className="mt-4 text-sm font-bold text-[var(--color-ink-strong)]">
          &ldquo;DON&apos;T PROPOSE UNTIL YOU CONNECT. DON&apos;T END A QUALIFIED CALL WITHOUT
          ATTEMPTING A CLOSE.&rdquo;
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Practice Scenarios</h2>
        <div className="mt-4 space-y-4">
          {scenarios.map((scenario, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-[var(--color-ink)]">
                  <span className="font-semibold text-[var(--color-ink-strong)]">Prospect says: </span>
                  {scenario.prospectSays}
                </p>
                <StageBadge stage={scenario.stage} />
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink)]">
                <span className="font-semibold text-[var(--color-ink-strong)]">Recommended response: </span>
                {scenario.agentResponse}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-ink-strong)]">Recommended CTA: </span>
                {scenario.cta}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Knowledge Check</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Answer all questions, then submit to see your results.
        </p>

        <div className="mt-4 space-y-5">
          {QUIZ_QUESTIONS.map((q, qi) => (
            <div key={qi}>
              <p className="text-sm font-semibold text-[var(--color-ink-strong)]">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-2 space-y-1.5">
                {q.options.map((option, oi) => {
                  const isSelected = answers[qi] === oi;
                  const isCorrect = oi === q.correctIndex;
                  let optionClasses = "border-[var(--color-border)]";
                  if (submitted && isSelected && isCorrect) {
                    optionClasses = "border-emerald-400 bg-emerald-50";
                  } else if (submitted && isSelected && !isCorrect) {
                    optionClasses = "border-rose-400 bg-rose-50";
                  } else if (submitted && isCorrect) {
                    optionClasses = "border-emerald-400 bg-emerald-50";
                  }
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-[var(--color-ink)] ${optionClasses}`}
                    >
                      <input
                        type="radio"
                        name={`quiz-question-${qi}`}
                        checked={isSelected}
                        onChange={() => {
                          setAnswers((prev) => ({ ...prev, [qi]: oi }));
                          setSubmitted(false);
                        }}
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!allAnswered}
          onClick={() => setSubmitted(true)}
          className="mt-6 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit Quiz
        </button>

        {submitted && (
          <p className="mt-4 text-sm font-bold text-[var(--color-ink-strong)]">
            Your score: {score} / {QUIZ_QUESTIONS.length}
            {score === QUIZ_QUESTIONS.length ? " — Perfect!" : " — review the highlighted answers above."}
          </p>
        )}
      </Card>
    </div>
  );
}
