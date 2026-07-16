import QuoteForm from "./QuoteForm";

export default function QuoteSection() {
  return (
    <section id="quote" className="bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Request a Quote</h2>
          <p className="mt-4 text-slate-600">
            Tell us about your property and cleaning needs, and we&apos;ll get back to you with a
            personalized quote.
          </p>
        </div>

        <div className="relative mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <QuoteForm />
        </div>
      </div>
    </section>
  );
}
