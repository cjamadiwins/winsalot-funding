import Header from "@/components/afsoon-cleaning/Header";
import Hero from "@/components/afsoon-cleaning/Hero";
import Services from "@/components/afsoon-cleaning/Services";
import WhyChooseUs from "@/components/afsoon-cleaning/WhyChooseUs";
import Pricing from "@/components/afsoon-cleaning/Pricing";
import QuoteSection from "@/components/afsoon-cleaning/QuoteSection";
import Contact from "@/components/afsoon-cleaning/Contact";
import Footer from "@/components/afsoon-cleaning/Footer";

export default function AfsoonCleaningPage() {
  return (
    <div className="bg-white text-slate-900">
      <Header />
      <Hero />
      <Services />
      <WhyChooseUs />
      <Pricing />
      <QuoteSection />
      <Contact />
      <Footer />
    </div>
  );
}
