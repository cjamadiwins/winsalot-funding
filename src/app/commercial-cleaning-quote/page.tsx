import Header from "@/components/commercial-cleaning/Header";
import Hero from "@/components/commercial-cleaning/Hero";
import Services from "@/components/commercial-cleaning/Services";
import WhyChooseUs from "@/components/commercial-cleaning/WhyChooseUs";
import QuoteSection from "@/components/commercial-cleaning/QuoteSection";
import Contact from "@/components/commercial-cleaning/Contact";
import Footer from "@/components/commercial-cleaning/Footer";

export default function CommercialCleaningQuotePage() {
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
