import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft, ChevronDown } from "lucide-react";
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
import { supabase } from "../supabaseClient";

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

/* ===================== CAR FINDER (QUIZ + LEAD FORM) DATA ===================== */
/*
  Inlined from the former BuyerCarFinder component (Figma node 2315:2).
  Budget labels are shared by the quiz and the form's <select> so the values
  line up when the quiz pre-fills the form.
*/
const BUDGET_OPTIONS = [
  "Under ₹5 Lakh",
  "₹5–10 Lakh",
  "₹10–20 Lakh",
  "₹20 Lakh+",
];
const BODY_TYPES = ["Hatchback", "SUV", "Sedan", "MUV"];
const FUEL_OPTIONS = ["Any", "Petrol", "Diesel", "CNG", "Electric"];
const TRANSMISSION_OPTIONS = ["Any", "Automatic", "Manual"];

/* The 4 quiz steps. Each `key` maps onto a form field so answers transfer
   straight across. Transmission's "Either works" maps back to "Any". */
const QUIZ_STEPS = [
  {
    key: "budget",
    title: "What's your budget for a car?",
    options: [
      { icon: "💰", label: "Under ₹5 Lakh" },
      { icon: "🎯", label: "₹5–10 Lakh" },
      { icon: "✨", label: "₹10–20 Lakh" },
      { icon: "🏎️", label: "₹20 Lakh+" },
    ],
  },
  {
    key: "bodyType",
    title: "How long have you been driving?",
    options: [
      { icon: "🎓", label: "Just got my licence" },
      { icon: "🌱", label: "Under a year" },
      { icon: "🚗", label: "1–3 years" },
      { icon: "🏆", label: "3+ years" },
    ],
  },
  {
    key: "fuel",
    title: "How would minor scratches make you feel?",
    options: [
      { icon: "😎", label: "Cars get scratches, whatever" },
      { icon: "😕", label: "I'd be annoyed but fine" },
      { icon: "😤", label: "Would ruin my week" },
    ],
  },
  {
    key: "transmission",
    title: "What matters most?",
    options: [
      { icon: "🏦", label: "Saving money" },
      { icon: "🛡️", label: "Latest safety tech" },
      { icon: "✅", label: "Warranty & peace of mind" },
      { icon: "🔧", label: "Low maintenance hassle" },
    ],
  },
];

/* ===================== "EVERYTHING ELSE" DATA ===================== */
/*
  Six things Lane handles beyond finding the car. Rendered in a 3-column
  checkerboard on desktop: even indices get a sky-blue card, odd indices a
  lime card (per Figma node 2274:2).
*/

const handledServices = [
  {
    icon: "🏦",
    title: "Financing",
    description:
      "HDFC Bank pre-approval. We push for the best rate for your profile, not the bank's default offer.",
  },
  {
    icon: "🛡️",
    title: "Insurance",
    description:
      "Comprehensive, third-party, zero-dep — we compare and get you the lowest premium for the right coverage.",
  },
  {
    icon: "📋",
    title: "RTO & Paperwork",
    description:
      "Registration, transfer, NOC, hypothecation removal. All the stuff you don't want to deal with.",
  },
  {
    icon: "🏷️",
    title: "FASTag",
    description: "Activated instantly. No bank visits, no waiting in line.",
  },
  {
    icon: "📹",
    title: "Dashcam",
    description:
      "Record every drive. Essential for insurance claims and your peace of mind.",
  },
  {
    icon: "🅿️",
    title: "Parking Sensors",
    description:
      "Tight spots, no stress. You'll thank us in Koramangala traffic.",
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
                   text-[clamp(16px,1.7vw,22px)]"
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

  /* ============ CAR FINDER STATE (quiz + lead form) ============ */
  /* QUIZ */
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [quizDone, setQuizDone] = useState(false);

  /* FORM */
  const [cfName, setCfName] = useState("");
  const [cfPhone, setCfPhone] = useState("");
  const [cfBudget, setCfBudget] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [bodyTypes, setBodyTypes] = useState([]);
  const [fuel, setFuel] = useState("Any");
  const [transmission, setTransmission] = useState("Any");
  const [cfLoading, setCfLoading] = useState(false);
  const [cfSubmitted, setCfSubmitted] = useState(false);
  const [cfErrors, setCfErrors] = useState({});

  const nameRef = useRef(null);

  /* QUIZ LOGIC */
  const handleSelect = (option) => {
    const current = QUIZ_STEPS[step];
    const next = { ...answers, [current.key]: option.label };
    setAnswers(next);

    if (step < QUIZ_STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    // Last question answered → push everything into the contact form.
    setCfBudget(next.budget || "");
    if (next.bodyType) setBodyTypes([next.bodyType]);
    if (next.fuel) setFuel(next.fuel);
    if (next.transmission) {
      setTransmission(
        next.transmission === "Either works" ? "Any" : next.transmission,
      );
    }
    setShowMore(true);
    setQuizDone(true);

    // Nudge the user to the contact form to finish.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const restartQuiz = () => {
    setStep(0);
    setAnswers({});
    setQuizDone(false);
  };

  /* FORM LOGIC */
  const toggleBodyType = (type) => {
    setBodyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleCarFinderSubmit = async () => {
    const newErrors = {};

    if (!cfName.trim()) newErrors.name = "Name is required";

    if (!cfPhone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^[6-9]\d{9}$/.test(cfPhone.replace(/\s/g, ""))) {
      newErrors.phone = "Enter a valid 10-digit phone number";
    }

    if (!cfBudget) newErrors.budget = "Please select your budget";

    if (Object.keys(newErrors).length > 0) {
      setCfErrors(newErrors);
      return;
    }

    try {
      setCfLoading(true);
      setCfErrors({});

      const { error } = await supabase.from("buyer_request").insert([
        {
          name: cfName,
          phone: cfPhone,
          budget: cfBudget,
          body_types: bodyTypes,
          fuel,
          transmission,
        },
      ]);

      if (error) {
        console.error("Supabase Error:", error);
        return;
      }

      setCfSubmitted(true);
      setCfName("");
      setCfPhone("");
      setCfBudget("");
      setBodyTypes([]);
      setFuel("Any");
      setTransmission("Any");
      setShowMore(false);
    } catch (err) {
      console.error("Submission Error:", err);
      alert("Oops! Unexpected error occurred");
    } finally {
      setCfLoading(false);
    }
  };

  /* SHARED FIELD CLASSES */
  const cfInputClass =
    "w-full rounded-[10px] border-[1.5px] border-[#EDEFEB] bg-white " +
    "px-[13px] py-[10px] font-['Bricolage_Grotesque'] font-medium " +
    "text-[#111] outline-none transition-colors focus:border-[#00CE84] " +
    "text-[14px] md:text-[15px]";

  const cfLabelClass =
    "mb-1 block font-['Bricolage_Grotesque'] font-semibold uppercase " +
    "tracking-[0.06em] text-[#3D4038] text-[12px] md:text-[13px]";

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
                           text-[clamp(22px,2.6vw,32px)]"
              >
                You learned to drive.
              </h2>
              <h1
                className="mt-0.5 font-['Bricolage_Grotesque'] font-semibold leading-[94%]
                           text-[#00CE84] drop-shadow-sm
                           text-[clamp(32px,4.2vw,54px)]"
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
                           text-[clamp(15px,1.55vw,20px)]"
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
                  className="mb-1.5 leading-none text-[clamp(24px,2.65vw,34px)]
                             sm:mb-2"
                >
                  {service.icon}
                </div>
                <h3
                  className="font-['Bricolage_Grotesque'] font-bold leading-[120%]
                             text-[#111111]
                             text-[clamp(14px,1.3vw,16px)]"
                >
                  {service.title}
                </h3>
                <p
                  className="mt-1.5 leading-[125%] text-[#7A7F75]
                             text-[clamp(14px,1.3vw,16px)]
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

      {/* ================= CAR FINDER (QUIZ + LEAD FORM) ================= */}
      {/*
        Figma node 2315:2 — two-column section (inlined from the former
        BuyerCarFinder component): a 4-step budget/preferences quiz on the left
        and a quick contact form on the right.

        Sizing is normalised to the rest of the page: same max-w-6xl canvas and
        px/py rhythm as the "Everything Else" / FAQ sections, scaling in
        proportion with their neighbours via the page's vw-based type scale.

        Columns are top-aligned (items-start) and each card sizes to its OWN
        content, so expanding the form's "Add more details" grows ONLY the green
        card — the purple quiz card keeps its natural dimensions.
      */}
      <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16 lg:py-20">
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-8 lg:gap-12">
          {/* ============================================================
              LEFT COLUMN — QUIZ
             ============================================================ */}
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <h2
                className="font-['Bricolage_Grotesque'] font-semibold tracking-[-0.015em]
                           text-[#111] leading-[1.05]
                           text-[clamp(22px,2.6vw,32px)]"
              >
                New or used? Let's figure it out.
              </h2>
              <p
                className="mx-auto mt-2 max-w-[430px] font-['Bricolage_Grotesque']
                           font-medium text-black leading-[140%] md:leading-[130%]
                           text-[clamp(14px,1.7vw,20px)]"
              >
                4 quick questions. No right answer — just what works for you.
              </p>
            </div>

            {/* Purple quiz card */}
            <div
              className="flex w-full flex-col rounded-[16px] border border-[rgba(209,179,255,0.3)]
                         bg-[#f3edff] p-5 sm:p-6 md:p-7"
            >
              {/* Progress bar */}
              <div className="mb-5 flex gap-[6px]">
                {QUIZ_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-[3px] flex-1 rounded-[3px] transition-colors duration-300 ${
                      quizDone || i <= step ? "bg-[#00CE84]" : "bg-[#edefeb]"
                    }`}
                  />
                ))}
              </div>

              {!quizDone ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3
                      className="font-['Bricolage_Grotesque'] font-semibold text-[#111]
                                 leading-[1.1]
                                 text-[clamp(18px,2.1vw,24px)]"
                    >
                      {QUIZ_STEPS[step].title}
                    </h3>
                    {step > 0 && (
                      <button
                        type="button"
                        onClick={() => setStep((s) => s - 1)}
                        className="flex shrink-0 items-center gap-1 font-['Bricolage_Grotesque']
                                   text-[12px] font-semibold text-[#6b5fa0]
                                   transition-colors hover:text-[#111]"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Back
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-[14px]">
                    {QUIZ_STEPS[step].options.map((option) => {
                      const active =
                        answers[QUIZ_STEPS[step].key] === option.label;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => handleSelect(option)}
                          className={`flex w-full items-center gap-3 rounded-[10px] border-[1.5px]
                                      bg-white px-4 text-left transition-all duration-200
                                      h-[54px] md:h-[58px]
                                      hover:border-[#00CE84] hover:bg-[#7bf1a8]/25
                                      hover:shadow-sm
                                      ${active ? "border-[#00CE84] ring-1 ring-[#00CE84]" : "border-[#edefeb]"}`}
                        >
                          <span className="text-[20px] leading-none">
                            {option.icon}
                          </span>
                          <span
                            className="font-['Bricolage_Grotesque'] font-medium text-[#111]
                                       text-[clamp(14px,1.4vw,16px)]"
                          >
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Completion recap */
                <div className="py-2">
                  <div className="mb-3 text-[34px] leading-none">✅</div>
                  <h3
                    className="font-['Bricolage_Grotesque'] font-semibold text-[#111]
                               text-[clamp(18px,2.1vw,24px)]"
                  >
                    Got your preferences!
                  </h3>
                  <p className="mt-2 font-['Bricolage_Grotesque'] text-[14px] font-medium text-[#6b5fa0]">
                    We've filled them into the form — just add your name and
                    number and we'll take it from here.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.values(answers).map((value) => (
                      <span
                        key={value}
                        className="rounded-full bg-white px-3 py-1.5 font-['Bricolage_Grotesque']
                                   text-[13px] font-semibold text-[#111]"
                      >
                        {value}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={restartQuiz}
                    className="mt-5 font-['Bricolage_Grotesque'] text-[13px] font-semibold
                               text-[#6b5fa0] transition-colors hover:text-[#111]"
                  >
                    ↺ Start over
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================
              RIGHT COLUMN — CONTACT FORM
             ============================================================ */}
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <h2
                className="font-['Bricolage_Grotesque'] font-semibold tracking-[-0.015em]
                           text-[#111] leading-[1.05]
                           text-[clamp(22px,2.6vw,32px)]"
              >
                Or just tell us what you need
              </h2>
              <p
                className="mx-auto mt-2 max-w-[410px] font-['Bricolage_Grotesque']
                           font-medium text-black leading-[140%] md:leading-[130%]
                           text-[clamp(14px,1.7vw,20px)]"
              >
                Name, number, budget — that's enough to get started. We'll call
                you.
              </p>
            </div>

            {/* Green form card */}
            <div
              className="flex w-full flex-col rounded-[16px] border border-[rgba(217,255,122,0.4)]
                         bg-[#f2ffd9] p-5 sm:p-6 md:p-7"
            >
              {cfSubmitted ? (
                /* Inline success state */
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 text-[40px] leading-none">🎉</div>
                  <h3 className="font-['Bricolage_Grotesque'] text-[20px] font-extrabold text-[#111]">
                    Got it!
                  </h3>
                  <p className="mx-auto mt-2 max-w-[320px] font-['Bricolage_Grotesque'] text-[14px] font-medium leading-[1.5] text-[#7A7F75]">
                    We'll call you within 24 hours with car picks that match
                    your budget. No pressure, just options.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCfSubmitted(false)}
                    className="mt-5 inline-flex items-center justify-center rounded-[12px]
                               bg-[#00CE84] px-7 py-3 font-['Bricolage_Grotesque']
                               text-[15px] font-bold text-white transition-colors hover:bg-[#00b574]"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* NAME */}
                  <div className="mb-4">
                    <label className={cfLabelClass} htmlFor="cf-name">
                      Name
                    </label>
                    <input
                      id="cf-name"
                      ref={nameRef}
                      type="text"
                      placeholder="Your name"
                      value={cfName}
                      onChange={(e) => {
                        setCfName(e.target.value);
                        setCfErrors((prev) => ({ ...prev, name: "" }));
                      }}
                      className={`${cfInputClass} ${cfErrors.name ? "border-red-500" : ""}`}
                    />
                    {cfErrors.name && (
                      <p className="mt-1 text-[12px] font-medium text-red-500">
                        {cfErrors.name}
                      </p>
                    )}
                  </div>

                  {/* PHONE */}
                  <div className="mb-4">
                    <label className={cfLabelClass} htmlFor="cf-phone">
                      Phone
                    </label>
                    <input
                      id="cf-phone"
                      type="tel"
                      placeholder="+91 98XXX XXXXX"
                      value={cfPhone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setCfPhone(value);
                        setCfErrors((prev) => ({ ...prev, phone: "" }));
                      }}
                      className={`${cfInputClass} ${cfErrors.phone ? "border-red-500" : ""}`}
                    />
                    {cfErrors.phone && (
                      <p className="mt-1 text-[12px] font-medium text-red-500">
                        {cfErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* BUDGET */}
                  <div className="mb-3">
                    <label className={cfLabelClass} htmlFor="cf-budget">
                      Budget
                    </label>
                    <select
                      id="cf-budget"
                      value={cfBudget}
                      onChange={(e) => {
                        setCfBudget(e.target.value);
                        setCfErrors((prev) => ({ ...prev, budget: "" }));
                      }}
                      className={`${cfInputClass} ${cfErrors.budget ? "border-red-500" : ""}`}
                    >
                      <option value="">What's your range?</option>
                      {BUDGET_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {cfErrors.budget && (
                      <p className="mt-1 text-[12px] font-medium text-red-500">
                        {cfErrors.budget}
                      </p>
                    )}
                  </div>

                  {/* ADD MORE DETAILS (collapsible) */}
                  <button
                    type="button"
                    onClick={() => setShowMore((s) => !s)}
                    className="mb-3 mt-1 self-start font-['Bricolage_Grotesque'] text-[13px]
                               font-semibold text-[#00b574]"
                  >
                    {showMore ? "−" : "+"} Add more details (optional)
                  </button>

                  {showMore && (
                    <div className="mb-1">
                      {/* BODY TYPE */}
                      <div className="mb-3">
                        <label className={cfLabelClass}>Body Type</label>
                        <div className="flex flex-wrap gap-[5px]">
                          {BODY_TYPES.map((type) => {
                            const active = bodyTypes.includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => toggleBodyType(type)}
                                className={
                                  "rounded-full border-[1.5px] px-[14px] py-[6px] " +
                                  "font-['Bricolage_Grotesque'] text-[13px] font-semibold transition-colors " +
                                  (active
                                    ? "border-[#00CE84] bg-[#00CE84] text-white"
                                    : "border-[#EDEFEB] bg-white text-[#111] hover:border-[#00CE84]")
                                }
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* FUEL + TRANSMISSION */}
                      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                        <div>
                          <label className={cfLabelClass} htmlFor="cf-fuel">
                            Fuel
                          </label>
                          <select
                            id="cf-fuel"
                            value={fuel}
                            onChange={(e) => setFuel(e.target.value)}
                            className={cfInputClass}
                          >
                            {FUEL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={cfLabelClass} htmlFor="cf-trans">
                            Transmission
                          </label>
                          <select
                            id="cf-trans"
                            value={transmission}
                            onChange={(e) => setTransmission(e.target.value)}
                            className={cfInputClass}
                          >
                            {TRANSMISSION_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBMIT */}
                  <button
                    type="button"
                    onClick={handleCarFinderSubmit}
                    disabled={cfLoading}
                    className="mt-4 flex w-full items-center justify-center gap-2
                               rounded-[12px] bg-[#00CE84] py-[12px]
                               font-['Bricolage_Grotesque'] text-[15px] font-bold text-white
                               transition-colors hover:bg-[#00b574]
                               disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cfLoading ? "Submitting..." : "Let's Talk"}
                    {!cfLoading && (
                      <ArrowRight className="h-4 w-4" strokeWidth={3} />
                    )}
                  </button>

                  <p className="mt-[6px] font-['Bricolage_Grotesque'] text-[12px] text-[#7A7F75]">
                    We'll call within 24 hours. No spam, no pressure.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= "EVERYTHING ELSE" SECTION ================= */}
      {/*
        Figma node 2274:2 — a full-bleed green band introducing the six
        post-purchase services Lane handles. The title sits over a lime brush
        highlight (Tag5.svg), and the cards alternate sky-blue / lime in a
        checkerboard on desktop.
      */}
      <div className="w-full bg-[#20CD86]">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8 md:py-16 lg:py-20">
          {/* ---------- HEADING BLOCK ---------- */}
          <div className="text-center">
            <span className="relative inline-block">
              <span
                aria-hidden="true"
                className="absolute inset-x-[-18px] bottom-[-10px] top-[-10px] -z-0 sm:inset-x-[-24px] sm:bottom-[-13px] sm:top-[-13px] md:inset-x-[-34px] md:bottom-[-18px] md:top-[-18px] translate-y-2"
                style={{
                  backgroundImage: "url('/Tag5.svg')",
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              />
              <h2
                className="relative z-10 font-['glancyr'] font-medium leading-none text-black
                           text-[30px] sm:text-[35px] md:text-[3.5vw] xl:text-[48px]"
              >
                Everything Else?
              </h2>
            </span>

            <p
              className="mt-6 font-['Bricolage_Grotesque'] font-medium leading-none text-black
                         text-[16px] sm:text-[22px] md:text-[3.0vw] xl:text-[34px]"
            >
              We Handle It.
            </p>

            <p
              className="mx-auto mt-3 max-w-[640px] font-['Bricolage_Grotesque'] font-medium text-black
                         text-[14px] sm:text-[16px] md:text-[1.5vw] xl:text-[20px]"
            >
              You focus on picking a colour. We'll sort the rest.
            </p>
          </div>

          {/* ---------- CARD GRID ---------- */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-5 md:mt-7 md:grid-cols-2 md:gap-x-12 md:gap-y-9 lg:grid-cols-3">
            {handledServices.map((service, index) => {
              // Even cards = sky-blue, odd cards = lime (checkerboard per Figma)
              const cardBg = index % 2 === 0 ? "bg-[#71ECFD]" : "bg-[#DAFD82]";

              return (
                <div
                  key={service.title}
                  className={`group flex flex-col rounded-[16px] px-5 py-5 sm:rounded-[20px] sm:px-7 sm:py-6 md:px-9 md:py-7 ${cardBg}
                              min-h-[130px] sm:min-h-[160px] md:min-h-[196px]
                              border-2 border-transparent
                              transition-all duration-300 ease-out
                              hover:-translate-y-1.5 hover:border-[#00CE84] hover:bg-white
                              hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)]`}
                >
                  <div className="mb-2.5 text-[20px] leading-none sm:mb-5 sm:text-[24px] md:text-[30px]">
                    {service.icon}
                  </div>
                  <h3
                    className="font-bold leading-tight text-black
                               text-[16px] sm:text-[18px] md:text-[1.9vw] xl:text-[26px]"
                  >
                    {service.title}
                  </h3>
                  <p
                    className="mt-1.5 font-medium leading-[140%] text-black
                               text-[clamp(14px,1.3vw,16px)]"
                  >
                    {service.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ---------- "LET'S CHAT" CTA ---------- */}
          <div className="mt-8 flex justify-center md:mt-12">
            <button
              onClick={() => setChatOpen(true)}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-[12px]
                         bg-white px-4 py-2.5 shadow-sm
                         transition-transform duration-300 hover:scale-[1.03]
                         md:px-6 md:py-3.5"
            >
              <span
                className="font-['Bricolage_Grotesque'] font-bold text-black
                           text-[14px] sm:text-[16px] md:text-[1.5vw] xl:text-[18px]"
              >
                Let's Chat
              </span>
              <ArrowRight
                className="h-5 w-5 text-black md:h-6 md:w-6"
                strokeWidth={3}
              />
            </button>
          </div>
        </div>
      </div>

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
                       text-[clamp(16px,2.2vw,28px)]"
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
                         text-[clamp(14px,1.4vw,18px)]"
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
                className="h-auto w-[clamp(120px,15.6vw,200px)]"
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
                           text-[clamp(18px,1.72vw,22px)]"
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
                                   text-[clamp(15px,1.25vw,16px)]"
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
                      className="group flex justify-center md:justify-start items-center gap-2.5 font-['Bricolage_Grotesque'] font-medium text-black transition-colors duration-200 hover:text-[#00CE84] text-[clamp(15px,1.25vw,16px)]"
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
