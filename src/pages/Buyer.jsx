import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  FaInstagram,
  FaXTwitter,
  FaLinkedinIn,
  FaWhatsapp,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa6";
import BuyerNavbar from "../components/BuyerNavbar";
import LetsChatModal from "../components/LetsChatModal";
import { useNavigate } from "react-router-dom";

/**
 * BuyerHeroSection
 * --------------------------------------------------------------------------
 * ARCHITECTURE (the permanent fix for resize overlap):
 *
 * The hero is split into TWO layout zones:
 *
 *   Zone 1 — "Overlap zone" (relative container with absolute children)
 *     Contains: headline, image stack, description
 *     These NEED to be absolute because they visually overlap each other.
 *     The container has a FIXED aspect-ratio so it scales proportionally.
 *
 *   Zone 2 — "Flow zone" (normal document flow)
 *     Contains: CTA buttons, service cards
 *     These are NEVER absolute. They sit in normal flow below Zone 1.
 *     This means they can NEVER overlap each other or overflow the section,
 *     regardless of viewport width.
 *
 * On mobile (<md): everything stacks in normal flow via flex-col + order-*.
 * On desktop (md+): Zone 1 uses absolute positioning; Zone 2 flows below it.
 * --------------------------------------------------------------------------
 */

const services = [
  {
    icon: "🚗",
    title: "Find Your Car",
    description: "New or used, we'll figure it out",
  },
  {
    icon: "🏦",
    title: "Best Loan Rate",
    description: "HDFC Bank, best rate for you",
  },
  {
    icon: "🛡️",
    title: "Insurance",
    description: "Right cover, lowest premium",
  },
  {
    icon: "📋",
    title: "RTO Paperwork",
    description: "Registration, transfer, NOC",
  },
  {
    icon: "🔧",
    title: "Parts & Accessories",
    description: "FASTag, dashcam, sensors",
  },
];

/* ===================== FAQ DATA ===================== */

const faqs = [
  {
    question: "Q- Where do Lane's cars come from?",
    answer:
      "A- Every car on Lane comes directly from its owner — not dealers, not auctions. Owners either respond to our Meta ads or list their car themselves through our sell page on Lane's website. That means you're getting real cars with real histories, not lot cars that have been sitting around.",
  },
  {
    question: "Q- Who handles the RC transfer from seller to buyer?",
    answer:
      "A- Lane does. This is one of the things we take off your plate entirely — RC transfer, Form 29/30 filing, and all RTO submissions are handled by our team.",
  },
  {
    question: "Q- Can I get a loan for a used car through Lane?",
    answer:
      "A- Yes. Lane works with lending partners for used car financing. We'll submit your profile and get you a pre-approval. Rates typically range from 10–18% for used cars depending on your profile.",
  },
  {
    question: "Q- What documents do I need for a used car loan?",
    answer:
      "A- Driving Licence, Aadhaar Card, PAN Card, Address Proof, Latest 3–6 months bank statements, Income proof (salary slips or ITR), Lane will guide you through exactly what's needed for your specific case.",
  },
  {
    question: "Q- Are Lane car prices fixed or negotiable?",
    answer:
      "A-  Prices are set by the owner. There is room to negotiate in most cases — Lane can advise you on whether the asking price is fair for that car's age, condition, and market value.",
  },
  {
    question: "Q- Will I need to visit the RTO office?",
    answer:
      "A- In most cases, no. Lane manages the paperwork on your behalf. You may need to be present for signature in some cases— we'll tell you in advance.",
  },

  {
    question: "Q- Can I see the seller's details?",
    answer:
      "A- We keep seller contact private until both sides are ready to connect. Lane handles the introduction once there's a serious buyer intent, to protect both parties.",
  },
  {
    question: "Q- Has the car been inspected before listing?",
    answer:
      "A- We collect and verify the information submitted by the seller — including ownership details, registration, and basic specs. For buyers, we strongly recommend (and can arrange) a physical inspection before finalising.",
  },
  {
    question: "Q- Are accident history or previous repairs disclosed?",
    answer:
      "A- Sellers are required to disclose this when submitting. If you spot a discrepancy during inspection, let us know — we take listing accuracy seriously.",
  },
  {
    question: "Q- How do I know Lane is legitimate?",
    answer:
      "A- Lane is the same company behind Lane Driving School — with 28,000+ hours of student experience in Bangalore. Our car service is an extension of helping people through the full first-car journey.",
  },
];

/* ===================== FOOTER DATA ===================== */

const socialLinks = [
  {
    Icon: FaInstagram,
    href: "https://www.instagram.com/inlane.in/",
    label: "Instagram",
  },
  { Icon: FaXTwitter, href: "https://x.com/inlane_in/", label: "X" },
  {
    Icon: FaLinkedinIn,
    href: "https://www.linkedin.com/company/in-lane/",
    label: "LinkedIn",
  },
];

const footerColumns = [
  {
    title: "Information",
    links: [
      { text: "About Us", href: "/about-us" },
      { text: "Courses", href: "/courses" },
      { text: "FAQs", href: "/faqs" },
      { text: "Lane Journal", href: "/blog" },
    ],
  },
  {
    title: "Quick Links",
    links: [
      { text: "Support", href: "/support" },
      { text: "Privacy Policy", href: "/privacy-policy" },
      { text: "Terms & Conditions", href: "/terms-and-conditions" },
    ],
  },
];

const contactLinks = [
  { Icon: FaPhone, text: "+91 9748439881", href: "tel:+919748439881" },
  { Icon: FaEnvelope, text: "info@inlane.in", href: "mailto:info@inlane.in" },
  {
    Icon: FaWhatsapp,
    text: "WhatsApp",
    href: "https://wa.me/919748439881",
    external: true,
  },
];

/**
 * FooterHeading
 * Column title with Tag5.svg as a background image behind the text (per Figma).
 */
function FooterHeading({ children }) {
  return (
    <h3 className="relative mb-3 md:mb-5 inline-block md:mb-5">
      <span
        aria-hidden="true"
        className="absolute inset-x-[-12px] bottom-[-4px] top-[-4px] -z-0"
        style={{
          backgroundImage: "url('/Tag5.svg')",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      />
      <span
        className="relative z-10 font-['Bricolage_Grotesque'] font-bold tracking-[-0.01em]
                   text-[#111111]
                   text-[16px]
                   sm:text-[18px]
                   md:text-[1.4vw]
                   xl:text-[22px]"
      >
        {children}
      </span>
    </h3>
  );
}

/**
 * FAQItem
 * A single collapsible accordion row. The black-bordered pill expands to
 * reveal its answer with a smooth grid-rows height transition (per Figma:
 * rounded-[20px] border, Bricolage Grotesque SemiBold question, chevron).
 */
function FAQItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-black bg-white transition-shadow duration-300">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4
                   px-4 py-3 text-left
                   md:px-6 md:py-3.5"
      >
        <span
          className="font-['Bricolage_Grotesque'] font-semibold leading-snug text-black
                     text-sm md:text-base"
        >
          {question}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-black transition-transform duration-300
                      ${isOpen ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {/* Answer — grid-rows trick gives a smooth open/close without measuring height */}
      <div
        className={`grid transition-all duration-300 ease-in-out
                    ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <p
            className="px-4 pb-3 pt-0 font-['Bricolage_Grotesque'] font-medium text-[#5A5F55]
                       leading-[150%]
                       text-sm md:text-base
                       md:px-6 md:pb-4"
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BuyerHeroSection() {
  // Controls the "Let's Chat" pop-up form
  const [chatOpen, setChatOpen] = useState(false);

  // Controls which FAQ accordion row is open (first row open by default, per Figma)
  const [openFaq, setOpenFaq] = useState(null);

  const midpoint = Math.ceil(faqs.length / 2);

  const faqsLeft = faqs.slice(0, midpoint);
  const faqsRight = faqs.slice(midpoint);

  const navigate = useNavigate();

  const handleChatSubmit = (data) => {
    // Hook this up to your lead API / analytics as needed.
    console.log("Lets Chat lead submitted:", data);
  };
  return (
    <section className="relative w-full overflow-x-hidden bg-[#F5F5F5]">
      {/* ================= NAVBAR ================= */}
      <BuyerNavbar
        backgroundColor="#F5F5F5"
        logo="/LANE_LOGO.svg"
        burgerMenu="/Green-Hamburger.png"
      />

      {/* ================= HERO WRAPPER ================= */}
      {/*
        On mobile: a simple flex-col that stacks everything.
        On desktop: two sequential blocks — the overlap zone, then the flow zone.
        max-w-[1280px] caps the canvas; everything inside is proportional.
      */}
      <div className="mx-auto w-full max-w-[1280px] -mt-[2px] md:-mt-[4px]">
        {/* ============ ZONE 1: OVERLAP ZONE ============ */}
        {/*
          This container has aspect-ratio so it scales proportionally.
          Only the headline, images, and description live here (they overlap).
          The aspect ratio is tuned to end right where the car's wheels
          touch the bottom — roughly the top 70% of the original Figma frame.
          Content zone tightened to end right at the car's wheels.
        */}
        <div
          className="relative w-full
                        md:aspect-[1704/880]"
        >
          {/* Mobile: flex-col stacking. Desktop: absolute overlap */}
          <div className="flex flex-col md:block relative w-full h-full">
            {/* ---------- HEADLINE ---------- */}
            {/* Figma: X=235(13.8%), Y offset ~9.8% of this zone */}
            <div
              className="relative z-30 order-1 mt-4 w-full px-5 text-center
                         md:absolute md:mt-0 md:px-0 md:text-left
                         md:left-[13.8%] md:top-[13.8%] md:w-[39.4%]"
            >
              <h2
                className="font-['Bricolage_Grotesque'] font-semibold leading-[106%]
                           text-black drop-shadow-sm
                           text-[22px] sm:text-[26px] md:text-[2.2vw] xl:text-[32px]"
              >
                You learned to drive.
              </h2>
              <h1
                className="mt-0.5 font-['Bricolage_Grotesque'] font-semibold leading-[94%]
                           text-[#00CE84] drop-shadow-sm
                           text-[32px] sm:text-[40px] md:text-[3.8vw] xl:text-[54px]"
              >
                Now let's find your car.
              </h1>
            </div>

            {/* ---------- IMAGE STACK ---------- */}
            {/* Figma: centered, ~62% width of canvas */}
            <div
              className="relative order-2 mx-auto mt-2 w-[85%]
                         aspect-[1255/997]
                         md:absolute md:mt-0
                         md:left-[16%] md:top-[5%] md:w-[62%]"
            >
              <img
                src="/scenery.png"
                alt="Scenery"
                className="absolute z-10 h-auto object-cover
                           left-1/2 top-0 w-[52.7%] -translate-x-1/2
                           md:left-[23.6%] md:w-[52.7%] md:translate-x-0"
              />
              <img
                src="/car.png"
                alt="Car"
                className="absolute bottom-0 left-0 z-20 h-auto w-full object-contain"
              />
            </div>

            {/* ---------- DESCRIPTION ---------- */}
            {/* Figma: X=958(56.2%), ~18.8% from top of this zone */}
            <div
              className="relative z-30 order-3 mt-4 w-full px-5 text-center
                         md:absolute md:mt-0 md:px-0 md:text-left
                         md:left-[56.2%] md:top-[26.6%] md:w-[35%]"
            >
              <p
                className="font-['Bricolage_Grotesque'] font-medium text-black
                           leading-[140%] md:leading-[130%]
                           text-[13px] sm:text-[15px] md:text-[1.4vw] xl:text-[20px]"
              >
                Think of us as that friend who's obsessed with cars. We'll help
                you pick the right one, get you the best loan rate, sort your
                insurance &amp; handle all the RTO headaches.
              </p>
            </div>
          </div>
        </div>

        {/* ============ ZONE 2: FLOW ZONE ============ */}
        {/*
          EVERYTHING here is in normal document flow. No absolute positioning.
          This is the permanent fix: these elements can NEVER overflow or
          overlap each other because they're stacked by the browser's
          normal layout engine, not pinned to arbitrary % positions.
        */}

        {/* ---------- CTA BUTTONS ---------- */}
        <div
          className="relative z-40 mt-2 flex w-full flex-col items-center
                     gap-3 px-5
                     sm:flex-row sm:justify-center
                     md:mt-3 md:gap-[34px] lg:mt-4 lg:gap-[42px]"
        >
          {/* Explore Cars */}
          <button
            className="group relative flex items-center justify-center
                       overflow-hidden rounded-full
                       border-[3px] border-white
                       bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                       shadow-[0_10px_28px_rgba(0,0,0,0.14)]
                       transition-all duration-300 hover:scale-[1.02]
                       h-[52px] w-full max-w-[250px]
                       sm:h-[56px] sm:max-w-[270px]
                       md:h-[64px] md:w-[300px] md:max-w-none
                       lg:h-[70px] lg:w-[330px]"
          >
            <span
              className="flex items-center gap-2
                         font-['Bricolage_Grotesque'] font-bold tracking-[-0.02em]
                         text-white
                         text-[15px] sm:text-[16px] md:text-[20px] lg:text-[22px]"
            >
              Explore Cars
              <ArrowRight
                className="h-4 w-4 md:h-5 md:w-5
                           transition-transform group-hover:translate-x-1"
                strokeWidth={3.2}
              />
            </span>
          </button>

          {/* Let's Chat */}
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center justify-center rounded-full
                       border-[3px] border-white bg-white
                       shadow-[0_10px_28px_rgba(0,0,0,0.12)]
                       transition-all duration-300 hover:scale-[1.02]
                       h-[52px] w-full max-w-[250px]
                       sm:h-[56px] sm:max-w-[270px]
                       md:h-[64px] md:w-[300px] md:max-w-none
                       lg:h-[70px] lg:w-[330px]"
          >
            <span
              className="font-['Bricolage_Grotesque'] font-bold tracking-[-0.02em]
                         text-black
                         text-[15px] sm:text-[16px] md:text-[20px] lg:text-[22px]"
            >
              Let's Chat
            </span>
          </button>
        </div>

        {/* ---------- SERVICES ---------- */}
        <div
          className="relative z-40 mt-6 w-full px-4
                     md:mt-8 md:px-[7.4%] lg:mt-10"
        >
          <div
            className="grid grid-cols-2 gap-2
                       sm:grid-cols-3 sm:gap-2.5
                       lg:grid-cols-5 lg:gap-[1.5vw] xl:gap-[22px]"
          >
            {services.map((service, index) => (
              <div
                key={index}
                className="flex h-full flex-col rounded-[4px]
                           border border-[#E3D9D9] bg-white
                           px-2.5 pb-2.5 pt-2.5
                           sm:px-3 sm:pb-3 sm:pt-3
                           md:rounded-[5px] md:px-[10px] md:pb-[12px] md:pt-[12px]
                           min-h-[105px] sm:min-h-[115px] md:min-h-[120px] lg:min-h-[135px]"
              >
                <div
                  className="mb-1.5 text-[24px] leading-none
                             sm:mb-2 sm:text-[26px]
                             md:text-[2vw] xl:text-[34px]"
                >
                  {service.icon}
                </div>
                <h3
                  className="font-['Bricolage_Grotesque'] font-bold leading-[120%]
                             text-[#111111]
                             text-[12px] sm:text-[13px] md:text-[1vw] xl:text-[16px]"
                >
                  {service.title}
                </h3>
                <p
                  className="mt-1.5 leading-[125%] text-[#7A7F75]
                             text-[12px] sm:text-[13px] md:text-[1vw] xl:text-[16px]
                             md:mt-2"
                >
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom padding inside the capped container */}
        <div className="h-6 md:h-8 lg:h-10" />
      </div>

      {/* ================= BOTTOM ACCENT BLOCK ================= */}
      <div className="h-[36px] w-full bg-[#D9FF7A] sm:h-[45px] md:h-[60px] lg:h-[80px] xl:h-[100px]" />

      {/* ================= FAQ SECTION ================= */}
      {/*
        Figma node 1791:41 — "Frequently Asked Questions".
        A white rounded card (16px radius, soft shadow) sitting on the page bg,
        with a left-aligned heading and a stack of black-bordered accordion rows.
      */}
      <div className="mx-auto w-full max-w-6xl px-5 py-7 md:px-5 md:py-11 lg:py-13">
        <div className="rounded-[20px] bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.25)] md:rounded-[2.5rem] md:p-12 lg:p-16">
          <h2
            className="font-['Bricolage_Grotesque'] font-semibold leading-tight text-black
                       text-2xl md:text-3xl"
          >
            Frequently Asked Questions
          </h2>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-3 md:gap-4">
              {faqsLeft.map((faq, index) => {
                const faqId = `left-${index}`;

                return (
                  <FAQItem
                    key={faqId}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFaq === faqId}
                    onToggle={() => setOpenFaq(openFaq === faqId ? -1 : faqId)}
                  />
                );
              })}
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-3 md:gap-4">
              {faqsRight.map((faq, index) => {
                const faqId = `right-${index}`;

                return (
                  <FAQItem
                    key={faqId}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFaq === faqId}
                    onToggle={() => setOpenFaq(openFaq === faqId ? -1 : faqId)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ================= FOOTER CTA ================= */}
      {/*
        Figma node 1748:1421 — "FOOTER CTA".
        A green (#00CE84) rounded banner sitting just above the footer, with a
        black headline on the left and a white "Let's Chat →" pill on the right.
        The button opens the same Let's Chat modal as the hero CTA.
      */}
      <div className="mx-auto w-full max-w-6xl px-5 pb-10 md:px-12 md:pb-18 lg:pb-20">
        <div
          className="flex flex-col items-center gap-5 rounded-[16px] bg-[#00CE84]
                     px-6 py-7 text-center
                     sm:flex-row sm:justify-between sm:text-left sm:gap-6
                     md:px-11 md:py-8"
        >
          <p
            className="max-w-[522px] font-['Bricolage_Grotesque'] font-light leading-[110%]
                       text-black
                       text-[16px] sm:text-[18px] md:text-[1.7vw] xl:text-[28px]"
          >
            Got more Questions ? Don't worry we got them covered.
          </p>

          <button
            onClick={() => navigate("/buyer/faqs")}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[12px]
                       bg-white px-2.5 py-1.5 shadow-sm
                       transition-transform duration-300 hover:scale-[1.03]
                       md:px-3.5 md:py-2.5"
          >
            <span
              className="font-['Bricolage_Grotesque'] font-bold text-black
                         text-[14px] sm:text-[16px] md:text-[1.5vw] xl:text-[18px]"
            >
              See more
            </span>
            <ArrowRight
              className="h-5 w-5 text-black md:h-6 md:w-6"
              strokeWidth={3}
            />
          </button>
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      {/*
        Footer with NavbarRoad.svg as top background image (same as Footer.jsx).
        Car animation matches Footer.jsx: car starts at right off-screen, moves
        left across the full viewport width.
      */}

      {/* ---------- CAR ANIMATION KEYFRAMES ---------- */}
      <style>{`
        @keyframes buyerCarMove {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-110vw - 100px)); }
        }
      `}</style>

      <footer
        className="relative w-full bg-white"
        style={{
          backgroundImage: "url('/NavbarRoad.svg')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% auto",
          backgroundPosition: "top center",
        }}
      >
        {/* Animated car running on the road — positioned above the road SVG */}
        <img
          src="/svg/car.png"
          alt="Moving car"
          aria-hidden="true"
          className="w-[30px] h-[30px] md:w-[60px] md:h-[60px]
                     top-[-25px] right-[-100px] md:top-[-50px] md:right-[-100px]"
          style={{
            position: "absolute",
            animation: "buyerCarMove 4s linear infinite",
            transform: "scaleX(-1)",
            zIndex: 30,
          }}
        />
        {/* ---------- FOOTER CONTENT ---------- */}
        <div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:py-8 md:py-14 md:pl-[9%] lg:pl-[6%]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-6">
            {/* Brand block */}
            <div className="flex flex-col items-center text-center md:items-start md:text-left sm:col-span-2 lg:col-span-1">
              <img
                src="/Lane_Footer_Logo.svg"
                alt="LANE — By Your Side, Every Ride"
                className="h-auto w-[120px] sm:w-[140px] md:w-[12vw] xl:w-[200px]"
              />
              <div className="mt-5 flex justify-center md:justify-start items-center gap-3 md:mt-6">
                {socialLinks.map(({ Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex items-center justify-center rounded-full bg-black text-white transition-transform duration-300 hover:scale-110 h-[34px] w-[34px] sm:h-[38px] sm:w-[38px] md:h-[2.9vw] md:w-[2.9vw] md:min-h-[40px] md:min-w-[40px] xl:h-[44px] xl:w-[44px]"
                  >
                    <Icon className="text-[15px] sm:text-[17px] xl:text-[20px]" />
                  </a>
                ))}
              </div>
              <p
                className="mt-5 font-['Bricolage_Grotesque'] font-semibold text-black md:mt-6
                           text-[18px] sm:text-[20px] md:text-[1.4vw] xl:text-[22px]"
              >
                We do cool things here!
              </p>
            </div>

            {/* Link columns: Information, Quick Links */}
            {footerColumns.map((col) => (
              <div key={col.title} className="text-center md:text-left">
                <FooterHeading>{col.title}</FooterHeading>
                <ul className="flex flex-col gap-3 md:gap-3.5">
                  {col.links.map((link) => (
                    <li key={link.text}>
                      <a
                        href={link.href}
                        className="font-['Bricolage_Grotesque'] font-medium text-black
                                   transition-colors duration-200 hover:text-[#00CE84]
                                   text-[15px] sm:text-[16px] md:text-[1.05vw] xl:text-[16px]"
                      >
                        {link.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Contact Us column */}
            <div className="text-center md:text-left">
              <FooterHeading>Contact Us</FooterHeading>
              <ul className="flex flex-col gap-3 md:gap-3.5">
                {contactLinks.map(({ Icon, text, href, external }) => (
                  <li key={text}>
                    <a
                      href={href}
                      target={external ? "_blank" : "_self"}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="group flex justify-center md:justify-start items-center gap-2.5 font-['Bricolage_Grotesque'] font-medium text-black transition-colors duration-200 hover:text-[#00CE84] text-[15px] sm:text-[16px] md:text-[1.05vw] xl:text-[16px]"
                    >
                      <Icon className="shrink-0 text-[16px] text-[#00CE84] xl:text-[18px]" />
                      {text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* ================= LET'S CHAT POP-UP ================= */}
      <LetsChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSubmit={handleChatSubmit}
      />
    </section>
  );
}
