// Root route ("/"). This project is now dedicated to the commercial
// cleaning quote system, so "/" renders the same homepage as
// /commercial-cleaning-quote directly — this makes every deployment URl
// (preview URLs included, not just the cleaning.winsalotcorp.com custom
// domain) show the correct homepage without depending on host-based
// middleware matching. The financing homepage previously here has been
// moved, not deleted — see src/app/funding/page.tsx.
import Header from "@/components/commercial-cleaning/Header";
import Hero from "@/components/commercial-cleaning/Hero";
import Services from "@/components/commercial-cleaning/Services";
import WhyChooseUs from "@/components/commercial-cleaning/WhyChooseUs";
import QuoteSection from "@/components/commercial-cleaning/QuoteSection";
import Contact from "@/components/commercial-cleaning/Contact";
import Footer from "@/components/commercial-cleaning/Footer";

export default function Home() {
  return (
    <div className="bg-white text-slate-900">
      <Header />
      <Hero />
      <Services />
      <WhyChooseUs />
      <QuoteSection />
      <Contact />
      <Footer />
    </div>
  );
}
