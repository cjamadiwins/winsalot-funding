"use client";

// "Winsalot Cold Calling Quality Standards" training manual - a single,
// shared component rendered from all four Training sections (Growth CRM
// admin + agent, Lead Generation CRM admin + agent) so the content, image,
// quiz and completion flow stay identical everywhere it appears, the same
// pattern already used by ConnectProposeCloseCourse and
// WebDesignProspectingTrainingContent in this codebase. Completion is
// recorded through submitSharedTrainingCompletionAction into
// crm_shared_training_completions (migration 0159) - see that file's
// header for why this manual gets its own narrow completion table instead
// of reusing crm_training_progress (Growth-only, no quiz score) or
// crm_training_materials (no completion tracking at all).

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import {
  COLD_CALLING_TRAINING_KEY,
  COLD_CALLING_TRAINING_VERSION,
  COLD_CALLING_PASS_THRESHOLD,
  type SharedTrainingCompletionRow,
  type SharedTrainingCrm,
} from "@/lib/shared-training-types";
import { submitSharedTrainingCompletionAction } from "@/lib/shared-training-actions";
import { COLD_CALLING_TRAINING_REMINDERS } from "@/lib/sales-coach";

const TRAINING_IMAGE_SRC = "/training/winsalot-cold-calling-quality-standards.png";
const TRAINING_IMAGE_ALT =
  "Winsalot Cold Calling Quality Standards—five essentials for better outbound calls.";
// Actual pixel dimensions of the attached PNG - required by next/image for
// a non-fill layout so it can reserve the right aspect ratio without
// cropping or distorting the source image.
const TRAINING_IMAGE_WIDTH = 1024;
const TRAINING_IMAGE_HEIGHT = 1536;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
      {children}
    </div>
  );
}

function SectionList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-sm leading-6 text-[var(--color-ink)]">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-0.5 shrink-0 text-[var(--color-accent)]">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "What is the primary purpose of active listening?",
    options: [
      "To finish the script quickly",
      "To understand the prospect's needs and situation",
      "To persuade every prospect to book",
      "To avoid asking questions",
    ],
    correctIndex: 1,
    explanation: "Active listening is about understanding the prospect's needs, not rushing the script.",
  },
  {
    question: "When should an agent log a call?",
    options: [
      "Only when an appointment is booked",
      "Only when the prospect is interested",
      "Immediately after every call attempt",
      "At the end of the week",
    ],
    correctIndex: 2,
    explanation: "Every call attempt must be logged immediately, including unsuccessful ones.",
  },
  {
    question: "What should an agent do after a clear Do Not Call request?",
    options: [
      "Try one more time",
      "Schedule a follow-up",
      "Immediately record and honour the restriction",
      "Send several emails instead",
    ],
    correctIndex: 2,
    explanation: "A Do Not Call request must be recorded and honoured immediately, with no further contact.",
  },
  {
    question: "How should a call script be used?",
    options: [
      "Read word-for-word without interruption",
      "Used as a guide while maintaining a natural conversation",
      "Ignored completely",
      "Used only by new agents",
    ],
    correctIndex: 1,
    explanation: "Scripts guide the conversation - they should not sound read word-for-word.",
  },
  {
    question: "What is the best final step before ending a productive call?",
    options: [
      "End the call immediately",
      "Confirm the agreed next action, date and time",
      "Repeat the complete script",
      "Promise a guaranteed result",
    ],
    correctIndex: 1,
    explanation: "Always confirm the specific next step, date and time before ending the call.",
  },
];

const QUALITY_CHECKLIST = [
  "I clearly introduced myself and Winsalot Corp.",
  "I explained the reason for the call.",
  "I asked relevant qualifying questions.",
  "I listened without interrupting.",
  "I remained professional.",
  "I explained value based on the prospect's needs.",
  "I confirmed the next step.",
  "I logged the call outcome and useful notes.",
  "I scheduled any promised follow-up.",
  "I recorded any Do Not Call request.",
];

const CALL_FLOW_STEPS = [
  "Check the Do Not Call List before calling.",
  "Review the business record and previous notes.",
  "Introduce yourself and Winsalot Corp.",
  "Clearly explain the reason for the call.",
  "Ask qualifying questions.",
  "Listen and identify the prospect's needs.",
  "Explain the relevant value.",
  "Respond calmly to questions or objections.",
  "Confirm the agreed next step.",
  "Log the call immediately.",
  "Schedule the callback, follow-up or appointment.",
  "Add a Do Not Call restriction immediately if requested.",
];

const APPROVED_OUTCOMES = [
  "No Answer",
  "Voicemail",
  "Gatekeeper",
  "Not Interested",
  "Callback",
  "Interested",
  "Appointment Booked",
  "Do Not Call",
];

export default function ColdCallingQualityStandardsTraining({
  crm,
  initialCompletion,
}: {
  crm: SharedTrainingCrm;
  initialCompletion: SharedTrainingCompletionRow | null;
}) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [completion, setCompletion] = useState<SharedTrainingCompletionRow | null>(initialCompletion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const score = QUIZ_QUESTIONS.reduce((total, q, i) => (answers[i] === q.correctIndex ? total + 1 : total), 0);
  const allAnswered = QUIZ_QUESTIONS.every((_, i) => answers[i] !== undefined);
  const passed = submitted && score / QUIZ_QUESTIONS.length >= COLD_CALLING_PASS_THRESHOLD;
  const alreadyCompleted = completion !== null;

  async function handleCompleteTraining() {
    setSaving(true);
    setSaveError(null);
    const result = await submitSharedTrainingCompletionAction(
      crm,
      COLD_CALLING_TRAINING_KEY,
      COLD_CALLING_TRAINING_VERSION,
      score,
      QUIZ_QUESTIONS.length,
      passed
    );
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setCompletion({
      id: completion?.id ?? "pending",
      created_at: completion?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      training_key: COLD_CALLING_TRAINING_KEY,
      training_version: COLD_CALLING_TRAINING_VERSION,
      crm_user_id: crm === "growth" ? (completion?.crm_user_id ?? "self") : null,
      leadgen_user_id: crm === "leadgen" ? (completion?.leadgen_user_id ?? "self") : null,
      user_name: completion?.user_name ?? "",
      user_email: completion?.user_email ?? "",
      quiz_score: score,
      quiz_total: QUIZ_QUESTIONS.length,
      passed,
      completed_at: new Date().toISOString(),
    });
  }

  function handleRetry() {
    setAnswers({});
    setSubmitted(false);
    setSaveError(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
          Winsalot Cold Calling Quality Standards
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Your guide to better outbound calls and stronger customer conversations.
        </p>
        {alreadyCompleted && (
          <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Completed {new Date(completion!.completed_at).toLocaleDateString()} — score {completion!.quiz_score}/
            {completion!.quiz_total}
          </p>
        )}
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setImageExpanded(true)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] transition hover:opacity-90"
          aria-label="View the Winsalot Cold Calling Quality Standards image at full size"
        >
          <Image
            src={TRAINING_IMAGE_SRC}
            alt={TRAINING_IMAGE_ALT}
            width={TRAINING_IMAGE_WIDTH}
            height={TRAINING_IMAGE_HEIGHT}
            className="h-auto w-full object-contain"
            sizes="(max-width: 640px) 100vw, 640px"
          />
        </button>
        <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">Tap the image to view it larger.</p>
      </Card>

      {imageExpanded && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={TRAINING_IMAGE_ALT}
          onClick={() => setImageExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setImageExpanded(false)}
            aria-label="Close enlarged image"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={TRAINING_IMAGE_SRC}
            alt={TRAINING_IMAGE_ALT}
            width={TRAINING_IMAGE_WIDTH}
            height={TRAINING_IMAGE_HEIGHT}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Purpose of This Training</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          Every outbound call represents Winsalot Corp. The purpose of this training is to help agents conduct
          professional conversations, understand each prospect&apos;s needs, recommend the appropriate next step and
          keep accurate CRM records.
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          A successful call does not always result in an immediate appointment. A quality call may produce a
          qualified opportunity, a scheduled callback, permission to send information or a clear indication that
          the prospect should not be contacted again.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">1. Active Listening</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Agents must listen to understand—not simply wait for an opportunity to continue the script.
        </p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Required behaviours:</p>
        <SectionList
          items={[
            "Ask short, relevant qualifying questions.",
            "Allow the prospect to finish speaking.",
            "Listen for business needs, timing, authority and interest.",
            "Identify whether the person is a decision-maker.",
            "Confirm important information before proceeding.",
            "Record relevant details in the CRM.",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Example questions:</p>
        <SectionList
          items={[
            "“Are you currently looking to attract more business clients?”",
            "“Who normally makes decisions about this service?”",
            "“What type of customers are you hoping to reach?”",
            "“Is this something you are considering now or later?”",
            "“Would it be better if we followed up at another time?”",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Avoid:</p>
        <SectionList
          items={[
            "Interrupting the prospect.",
            "Asking several questions without acknowledging the answers.",
            "Rushing through the script.",
            "Ignoring information that does not match a prepared response.",
          ]}
        />
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">2. Clear Communication</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          The prospect should quickly understand who is calling, what company the agent represents and why the call
          may be relevant.
        </p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Required behaviours:</p>
        <SectionList
          items={[
            "State your name and identify Winsalot Corp.",
            "Explain the reason for the call early.",
            "Use clear, simple and confident language.",
            "Keep the introduction concise.",
            "Use a conversational tone.",
            "Provide accurate and transparent information.",
            "Never make promises that Winsalot cannot guarantee.",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Recommended opening:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;Hi, this is [Agent Name] calling from Winsalot Corp. We help businesses connect with qualified
          opportunities. I&apos;m reaching out to see whether your company is currently interested in [relevant
          service or result].&rdquo;
        </div>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Scripts guide the conversation. They should not sound as though they are being read word-for-word.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">3. Empathy and Professionalism</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Agents must respect the prospect&apos;s time, preferences and communication style.
        </p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Required behaviours:</p>
        <SectionList
          items={[
            "Maintain a calm and polite tone.",
            "Acknowledge concerns without becoming defensive.",
            "Adapt the conversation to the prospect's level of interest.",
            "Ask whether it is a convenient time when appropriate.",
            "Thank the prospect for their time.",
            "End the call respectfully, even when the answer is no.",
            "Immediately honour a request not to be contacted.",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Example objection response:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;I understand. It sounds like this may not be the right time. Would you prefer that we follow up
          later, send brief information by email or close the conversation here?&rdquo;
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Never:</p>
        <SectionList
          items={[
            "Argue with the prospect.",
            "Pressure someone after a clear refusal.",
            "Speak disrespectfully.",
            "Continue calling after a Do Not Call request has been recorded.",
          ]}
        />
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">4. Value-Based Problem Solving</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Do not present a service until you understand whether it fits the prospect&apos;s needs.
        </p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Required behaviours:</p>
        <SectionList
          items={[
            "Identify the prospect's actual challenge.",
            "Match the correct Winsalot service to that need.",
            "Explain the business benefit clearly.",
            "Personalize the conversation using the information provided.",
            "Recommend a realistic next step.",
            "Avoid overwhelming the prospect with unnecessary details.",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Lead-generation example:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;Based on what you&apos;ve explained, you want to reach more business decision-makers without
          building an internal calling team. Winsalot may be able to help by conducting outbound prospecting and
          booking qualified conversations for your company.&rdquo;
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Business-finance example:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;Based on your current business need, the appropriate next step would be a short qualification
          review. We can explain the information participating lenders may require, but approval and terms are
          determined by the lender.&rdquo;
        </div>
        <div className="mt-4 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-4">
          <p className="text-sm font-bold text-[var(--color-accent-soft-text)]">
            Never guarantee leads, sales, financing approval, funding amounts or specific results unless the approved
            offer expressly allows that statement.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">5. Call Logging and Follow-Up</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
          Every business call must be logged in the CRM, including unsuccessful calls. Accurate records protect the
          company, prevent duplicated work and allow proper coaching and follow-up.
        </p>
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">
          Immediately after every call, record:
        </p>
        <SectionList
          items={[
            "Business or client",
            "Contact person, when known",
            "Call date and time",
            "Call outcome",
            "Concise notes",
            "Prospect's needs or objections",
            "Decision-maker status",
            "Promised next action",
            "Callback or follow-up date",
            "Do Not Call request, when applicable",
          ]}
        />
        <p className="mt-4 text-sm font-semibold text-[var(--color-ink-strong)]">Approved outcomes include:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {APPROVED_OUTCOMES.map((outcome) => (
            <span
              key={outcome}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-ink)]"
            >
              {outcome}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          Do not use vague notes such as &ldquo;called,&rdquo; &ldquo;follow up&rdquo; or &ldquo;spoke to
          customer.&rdquo;
        </p>
        <p className="mt-3 text-sm font-semibold text-[var(--color-ink-strong)]">Good note example:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;Spoke with Jordan, the owner. Interested in learning about B2B appointment setting but currently
          reviewing the October budget. Requested a callback on September 28 at 2:00 p.m. Email information before
          callback.&rdquo;
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Standard Call Flow</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Agents should follow this sequence:</p>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-ink)]">
          {CALL_FLOW_STEPS.map((step, i) => (
            <li key={step} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <span className="font-semibold text-[var(--color-ink-strong)]">{i + 1}. </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Before Ending the Call</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Use a clear recap:</p>
        <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm italic leading-6 text-[var(--color-ink)]">
          &ldquo;Just to confirm, I will [send the information/call you back/book the consultation] on [date and
          time]. Is that correct?&rdquo;
        </div>
        <p className="mt-3 text-sm text-[var(--color-ink)]">
          The prospect should understand exactly what will happen next.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Quality Checklist</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Before marking the call complete, confirm:</p>
        <SectionList items={QUALITY_CHECKLIST} />
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Sales Coach Reminders</h2>
        <SectionList items={[...COLD_CALLING_TRAINING_REMINDERS]} />
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Knowledge Check</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Answer all five questions, then submit to see your score. A score of 80% (4 out of 5) or higher is required
          to pass — you may retry as many times as needed.
        </p>

        <div className="mt-4 space-y-5">
          {QUIZ_QUESTIONS.map((q, qi) => (
            <div key={q.question}>
              <p className="text-sm font-semibold text-[var(--color-ink-strong)]">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-2 space-y-1.5">
                {q.options.map((option, oi) => {
                  const isSelected = answers[qi] === oi;
                  const isCorrect = oi === q.correctIndex;
                  let optionClasses = "border-[var(--color-border)]";
                  if (submitted && isCorrect) optionClasses = "border-emerald-400 bg-emerald-50";
                  else if (submitted && isSelected && !isCorrect) optionClasses = "border-rose-400 bg-rose-50";
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-[var(--color-ink)] ${optionClasses}`}
                    >
                      <input
                        type="radio"
                        name={`cold-calling-quiz-question-${qi}`}
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
              {submitted && answers[qi] !== q.correctIndex && (
                <p className="mt-1.5 text-xs text-rose-700">{q.explanation}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!allAnswered}
            onClick={() => setSubmitted(true)}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit Quiz
          </button>
          {submitted && !passed && (
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink-strong)] transition hover:bg-[var(--color-bg)]"
            >
              Retry Quiz
            </button>
          )}
        </div>

        {submitted && (
          <p className={`mt-4 text-sm font-bold ${passed ? "text-emerald-700" : "text-rose-700"}`}>
            Your score: {score} / {QUIZ_QUESTIONS.length}
            {passed ? " — Passed!" : " — 80% is required to pass. Review the highlighted answers above and retry."}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Agent Acknowledgement</h2>
        <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            &ldquo;I confirm that I have reviewed and understood the Winsalot Cold Calling Quality Standards. I
            understand that I must communicate professionally, honour contact restrictions and accurately record
            every call and follow-up in the CRM.&rdquo;
          </span>
        </label>

        <button
          type="button"
          disabled={!passed || !acknowledged || saving}
          onClick={handleCompleteTraining}
          className="mt-4 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : alreadyCompleted ? "Update Completion" : "Complete Training"}
        </button>
        {!passed && <p className="mt-2 text-xs text-[var(--color-text-muted)]">Pass the knowledge check above first.</p>}
        {saveError && <p className="mt-2 text-xs text-rose-700">{saveError}</p>}
        {alreadyCompleted && !saveError && (
          <p className="mt-2 text-xs text-emerald-700">
            Recorded {new Date(completion!.completed_at).toLocaleString()} — score {completion!.quiz_score}/
            {completion!.quiz_total}.
          </p>
        )}
      </Card>
    </div>
  );
}
