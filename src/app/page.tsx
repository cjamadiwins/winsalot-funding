import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import LogoStrip from "@/components/LogoStrip";
import ValueProps from "@/components/ValueProps";
import Products from "@/components/Products";
import HowItWorks from "@/components/HowItWorks";
import EligibilityCta from "@/components/EligibilityCta";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <LogoStrip />
      <ValueProps />
      <Products />
      <HowItWorks />
      <EligibilityCta />
      <Testimonials />
      <Footer />
    </>
  );
}
