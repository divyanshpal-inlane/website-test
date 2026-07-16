import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, ChevronDown } from "lucide-react";
import BuyerNavbar from "../components/BuyerNavbar";
import RTOLeadModal from "../components/RTOLeadModal";
import RTOFooter from "../components/RTOFooter";
import {
  SERVICE_CATEGORIES,
  servicesByCategory,
  rtoServices,
} from "../data/rtoServicesData";

/**
 * RTOHeroSection
 * ---------------------------------------------------------------------------
 * Standalone RTO landing page.
 *
 * Layout matches the Buyer page: the LANE logo sits in a centered navbar bar
 * (BuyerNavbar) with the dashed road strip acting as the top border. The hero
 * image sits BELOW that bar — the navbar is never overlaid on the photo, so
 * the logo + road border stay locked in position exactly like the Buyer page.
 *
 * The search bar straddles the hero → white boundary (floating pill) with a
 * profile avatar badge poking out the top-right corner.
 *
 * Card data now lives in ../data/rtoServicesData.js and detail content in
 * ../data/rtoServiceContent.js — same split as locations.js / locationContent.js.
 * Clicking "Start now" routes to /rto-services/:slug (see RTOServiceDetailPage).
 * ---------------------------------------------------------------------------
 */
const STEPS = [
  { n: 1, label: "Pick service" },
  { n: 2, label: "Upload docs" },
  { n: 3, label: "Pay online" },
  { n: 4, label: "Lane processes at RTO" },
  { n: 5, label: "Delivered to your door" },
];

// Per-card cyan variants: fading (light) → strong, left to right.
const STATS = [
  { value: "14+", label: "Services", bg: "#ADEBFF" },
  { value: "4.8★", label: "Rating", bg: "#83E1FB" },
  { value: "1,000+", label: "Cases done", bg: "#57D6F7" },
];

const SERVICE_TABS = SERVICE_CATEGORIES; // ["Driving Licence", "RC — Car", "RC — Bike"]

/* ===================== FAQ ===================== */
// Each answer is an array of paragraphs so multi-part answers render cleanly.
const RTO_FAQS = [
  {
    question: "What if my old DL isn't showing up online?",
    answer: [
      "Your old DL from before 2005–2010 likely needs digitisation — a one-time process where the RTO manually enters your details into the Sarathi system (18–30 days). Lane handles the entire process.",
      "After digitisation, all online services become available — you can then renew, change address, or do any other service.",
    ],
  },
  {
    question: "I'm moving to Bengaluru with a DL from another state. What do I do?",
    answer: [
      "Two options: (1) Update your DL address (18–30 days) — Lane handles this on the Sarathi portal, or (2) Keep your original state DL — it's valid across India, but you'll need to update it if you later need services.",
      "If you're also bringing a vehicle, you must complete RC Transfer (Other State → KA) within 11 months of moving (30–45 days). Lane handles the full process.",
    ],
  },
  {
    question: "My DL expired over a year ago. Can I still renew?",
    answer: [
      "Expired within 1 year: yes, Lane can renew it online (18–30 days).",
      "Expired 1+ year ago: you'll need to take a driving test at the RTO — we recommend contacting us for guidance on this specific case.",
      "Age 40+: you'll need a medical certificate (Form 1A) regardless of the expiry timeline.",
    ],
  },
  {
    question: "Does my car/bike need a Fitness Certificate (FC)?",
    answer: [
      "You need an FC if your vehicle is 15+ years old (from the date of first registration). Check your RC for the registration date — after the first renewal, you'll renew every 5 years.",
      "Lane handles booking the inspection slot, ensuring all documents are ready, and issuing the new RC with FC endorsement in 18–30 days. You just bring the vehicle on the inspection date.",
      "FC pricing depends on vehicle age — Lane quotes exactly.",
    ],
  },
  {
    question: "I want to transfer my car/bike to someone. How long does it take?",
    answer: [
      "Timeline: 18–30 business days.",
      "You need both buyer & seller to sign Forms 29 & 30, plus the buyer's address proof, insurance (in the buyer's name), valid PUC, original RC, 3 photos, and PAN/Form 60.",
      "Special cases: a different RTO zone needs an NOC (Form 28) from the original RTO; an active loan must be cleared first, with a bank NOC.",
      "Lane handles all portal applications, RTO inspection coordination, document submission, and new RC dispatch.",
    ],
  },
  {
    question: "I lost my DL. What happens now?",
    answer: [
      "Timeline: 18–30 business days.",
      "Lane does everything: files the FIR online (no police-station visit needed), gets the affidavit notarised, applies on Sarathi with the FIR copy + affidavit, handles RTO approvals, and Speed Post delivers your duplicate DL.",
      "You need your DL number (if you remember it), address proof, and a description of the loss.",
      "Note: if your DL was in backlog (not online), digitisation happens first.",
    ],
  },
  {
    question: "What's the difference between DL and RC services? Which RTO?",
    answer: [
      "DL is your personal driving licence (renewal, address change, name change, duplicate). RC is your vehicle registration (owner transfer, address change, fitness renewal, NOC).",
      "Lane handles both via the online government portals (Sarathi for DL, Parivahan for RC). You rarely need to visit an RTO — Lane coordinates everything.",
      "We cover 9 Bengaluru RTO zones: HSR Layout, Rajajinagar, Kasturi Nagar, Yeshwantpur, Jayanagar, Jnanabharathi, Yelahanka, Electronic City, and KR Puram.",
    ],
  },
  {
    question: "I'm moving OUT of Karnataka. What do I do?",
    answer: [
      "For your DL: keep it as-is (valid across India) or update the address (optional). No action required.",
      "For your vehicle: get an NOC from the Karnataka RTO before leaving (mandatory, 18–30 days). Lane applies online, verifies there are no pending challans, and hands over the certificate. You take the NOC to your new state's RTO for re-registration.",
      "Bonus: your Karnataka road tax can be refunded — Lane can guide you.",
    ],
  },
  {
    question: "How much do services cost? What's included?",
    answer: [
      "Lane's pricing covers government RTO fees, expert handling, online application filing, physical document submission, follow-up and approvals, and Speed Post delivery.",
      "Typical costs: DL services ₹500–2,000 and RC transfers ₹800–3,000 (government fee + Lane fee). Final cost varies by vehicle age, state of origin, and whether backlog digitisation is needed.",
      "You get transparent pricing upfront — quoted before you pay, with no hidden fees.",
    ],
  },
  {
    question: "What if my application gets rejected or there's a problem?",
    answer: [
      "Lane proactively handles common issues: 'Record not found' (digitisation needed first), pending traffic challans (must be cleared), missing documents, vehicle inspection issues, an active loan on the vehicle, or a one-time biometric appointment.",
      "Lane's support: WhatsApp updates at every stage, clear explanations of delays, guidance on fixes, and reapplication once issues are resolved. No extra service charges unless additional government fees apply.",
    ],
  },
];

/** A single collapsible FAQ row (mirrors the Buyer page's accordion). */
function RTOFAQItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e8e8e4] bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left md:px-5 md:py-3.5"
      >
        <span className="font-['Bricolage_Grotesque'] font-semibold leading-snug text-black text-[15px] md:text-[16px]">
          {question}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#00CE84] transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          strokeWidth={2.5}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 px-4 py-4 md:px-5">
            {answer.map((para, i) => (
              <p
                key={i}
                className="font-['Bricolage_Grotesque'] font-medium leading-[150%] text-[#5A5F55] text-[14px] md:text-[15px]"
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RTOHeroSection() {
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(SERVICE_TABS[0]);
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  // Split the FAQs into two balanced columns (matches the Buyer FAQ layout).
  const faqMidpoint = Math.ceil(RTO_FAQS.length / 2);
  const faqsLeft = RTO_FAQS.slice(0, faqMidpoint);
  const faqsRight = RTO_FAQS.slice(faqMidpoint);

  // Filtered list: category tab is always applied; a search query narrows it
  // further by title/tag match, and — if it matches something outside the
  // active tab — automatically searches across every category too.
  const services = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return servicesByCategory[activeTab] || [];

    const matches = (svc) =>
      svc.title.toLowerCase().includes(q) ||
      svc.tags.some((t) => t.toLowerCase().includes(q));

    const withinTab = (servicesByCategory[activeTab] || []).filter(matches);
    if (withinTab.length > 0) return withinTab;

    // Nothing in the active tab matched — fall back to a global search so a
    // query like "bike" still surfaces results even if "Driving Licence" is
    // the selected tab.
    return rtoServices.filter(matches);
  }, [activeTab, query]);

  const isGlobalSearchFallback =
    query.trim() && services.length > 0 && services.some((s) => s.category !== activeTab);

  const goToService = (slug) => navigate(`/rto-services/${slug}`);

  return (
    <section className="relative w-full overflow-x-hidden bg-white">
      {/* ================= NAVBAR (logo + dashed road top border) ================= */}
      <BuyerNavbar
        backgroundColor="#FFFFFF"
        logo="/LANE_LOGO.svg"
        burgerMenu="/rto-hamburger.svg"
      />

      {/* ================= HERO ================= */}
      <div
        className="relative -mt-[2px] w-full bg-cover bg-center md:-mt-[4px]"
        style={{ backgroundImage: "url('/rto-hero-bg.jpg')" }}
      >
        {/* Dark overlay (rgba(0,0,0,0.34) per Figma) */}
        <div aria-hidden className="absolute inset-0 bg-black/[0.34]" />

        {/* Content */}
        <div
          className="relative z-10 mx-auto flex min-h-[400px] w-full max-w-[960px]
                     flex-col items-center justify-center gap-5 px-5
                     pb-16 pt-12 text-center
                     sm:min-h-[430px] md:min-h-[460px] md:gap-[20px] md:pb-20 md:pt-16
                     lg:min-h-[490px]"
        >
          {/* ---------- HEADLINE + DESCRIPTION ---------- */}
          <div className="flex flex-col items-center gap-2.5 md:gap-3">
            <div className="flex flex-col items-center">
              <span className="relative inline-block rotate-[-0.83deg]">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-0"
                  style={{
                    backgroundImage: "url('/rto-highlight.svg')",
                    backgroundSize: "100% 100%",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
                <span
                  className="relative z-10 block px-[0.38em] py-[0.26em]
                             font-['Bricolage_Grotesque'] font-bold leading-none
                             text-black
                             text-[clamp(32px,4vw,56px)]"
                  style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
                >
                  RTO done
                </span>
              </span>

              <span
                className="mt-1 font-['glancyr'] font-medium capitalize leading-[1.1]
                           text-white
                           text-[clamp(20px,2.4vw,32px)]"
              >
                from your couch.
              </span>
            </div>

            <p
              className="max-w-[620px] font-['Bricolage_Grotesque'] font-medium leading-[1.35]
                         text-white
                         text-[clamp(14px,1.6vw,18px)]"
              style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
            >
              Upload documents, pay online. Lane processes at RTO. No queues, no
              agents, no confusion.
            </p>
          </div>

          {/* ---------- CTA BUTTONS ---------- */}
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center md:gap-[28px]">
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("all-services")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="flex items-center justify-center rounded-full
                         border-[3px] border-white
                         bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                         font-['Bricolage_Grotesque'] font-bold text-white
                         shadow-[0_10px_28px_rgba(0,0,0,0.18)]
                         transition-transform duration-300 hover:scale-[1.02]
                         h-[48px] w-full max-w-[220px]
                         text-[15px] sm:h-[52px] sm:max-w-[240px] sm:text-[15px]
                         md:h-[56px] md:w-[280px] md:max-w-none md:text-[17px]
                         lg:h-[64px] lg:w-[320px] lg:text-[18px]"
              style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
            >
              Browse services
            </button>

            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex items-center justify-center rounded-full
                         border-[3px] border-white bg-white
                         font-['Bricolage_Grotesque'] font-bold text-black
                         shadow-[0_10px_28px_rgba(0,0,0,0.18)]
                         transition-transform duration-300 hover:scale-[1.02]
                         h-[48px] w-full max-w-[220px]
                         text-[15px] sm:h-[52px] sm:max-w-[240px] sm:text-[15px]
                         md:h-[56px] md:w-[280px] md:max-w-none md:text-[17px]
                         lg:h-[64px] lg:w-[320px] lg:text-[18px]"
              style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
            >
              Get a callback
            </button>
          </div>
        </div>
      </div>

      {/* ================= SEARCH BAR (floats over hero → white boundary) ================= */}
      <div className="relative z-20 mx-auto -mt-8 w-full max-w-[680px] px-5 md:-mt-10">
        <div className="relative">
          <div
            className="flex w-full items-center rounded-full
                       border-2 border-[#e8e8e4] bg-[#00ce84]
                       p-1 shadow-[0_6px_20px_rgba(0,0,0,0.28)]
                       md:p-2"
          >
            <label
              className="flex w-full items-center gap-3 rounded-full bg-white
                         px-5 py-2.5 shadow-[0_4px_8.4px_rgba(0,0,0,0.25)]
                         md:px-6 md:py-3"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — try 'duplicate' or 'name change'..."
                className="w-full min-w-0 bg-transparent font-['Bricolage_Grotesque']
                           text-black outline-none
                           placeholder:text-black/80
                           text-[clamp(14px,1.4vw,17px)]"
              />
              <Search
                className="h-5 w-5 shrink-0 text-black md:h-[22px] md:w-[22px]"
                strokeWidth={2.2}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ================= HOW IT WORKS (5-step strip) ================= */}
      <div className="mx-auto w-full max-w-[1000px] px-5 pb-20 pt-12 md:pb-28 md:pt-16">
        <ol className="flex items-start justify-between">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="relative flex flex-1 flex-col items-center text-center"
            >
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-1/2 top-[15px] -z-0 h-px w-full bg-[#d8dbd4] md:top-[19px]"
                />
              )}

              <span
                className="relative z-10 flex h-[32px] w-[32px] items-center justify-center
                           rounded-full bg-[#00CE84]
                           font-['Bricolage_Grotesque'] font-bold text-white
                           shadow-[0_0_0_4px_rgba(0,206,132,0.18)]
                           text-[14px] md:h-[40px] md:w-[40px] md:text-[17px]"
              >
                {step.n}
              </span>

              <span
                className="mt-2.5 max-w-[9ch] font-['Bricolage_Grotesque'] font-medium
                           leading-[1.2] text-[#3D4038]
                           text-[12px] sm:text-[13px] md:text-[15px]"
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        {/* ---------- STATS BAR (single connected cyan bar) ---------- */}
        <div className="relative mx-auto mt-10 max-w-[860px] md:mt-12">
          <div
            className="grid grid-cols-3 overflow-hidden rounded-[20px]
                       shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
          >
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center px-3 py-9 text-center md:py-14"
                style={{ backgroundColor: stat.bg }}
              >
                <span
                  className="font-['Bricolage_Grotesque'] font-bold leading-none text-black
                             text-[clamp(26px,3.2vw,40px)]"
                  style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
                >
                  {stat.value}
                </span>
                <span
                  className="mt-1.5 font-['Bricolage_Grotesque'] font-medium text-[#3D4038]
                             text-[clamp(12px,1.3vw,17px)]"
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <img
            src="/barricade.svg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -bottom-12 -right-5 z-10 h-auto
                       w-[88px] select-none md:-bottom-[64px] md:-right-[38px] md:w-[128px]"
          />
        </div>
      </div>

      {/* ================= ALL SERVICES ================= */}
      <div
        id="all-services"
        className="relative w-full bg-[#20CD87] bg-cover bg-center bg-no-repeat px-5 py-14 md:py-20"
        style={{ backgroundImage: "url('/TestimonialBG.svg')" }}
      >
        <div className="mx-auto w-full max-w-[1200px]">
          {/* ---------- HEADER ---------- */}
          <div className="text-center">
            <span className="relative inline-block rotate-[-0.83deg]">
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-0"
                style={{
                  backgroundImage: "url('/rto-highlight.svg')",
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              />
              <span
                className="relative z-10 block px-[0.5em] py-[0.28em]
                           font-['Bricolage_Grotesque'] font-bold leading-none text-black
                           text-[clamp(32px,4vw,56px)]"
                style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
              >
                All Services
              </span>
            </span>
            <p
              className="mt-5 font-['Bricolage_Grotesque'] font-medium leading-[1.35] text-black
                         text-[clamp(14px,1.6vw,18px)]"
            >
              Tap a card to see documents, timeline &amp; pricing.
            </p>
          </div>

          {/* ---------- TABS ---------- */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:mt-9">
            {SERVICE_TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-5 py-2.5 font-['Bricolage_Grotesque'] font-semibold
                              transition-colors text-[clamp(14px,1.6vw,16px)]
                              ${
                                active
                                  ? "bg-[#DAFD82] text-black"
                                  : "bg-white text-black hover:bg-white/90"
                              }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {isGlobalSearchFallback && (
            <p className="mt-4 text-center font-['Bricolage_Grotesque'] text-[13px] font-medium text-black/70">
              No matches in "{activeTab}" — showing results across all services.
            </p>
          )}

          {/* ---------- SERVICE CARDS ---------- */}
          {services.length > 0 ? (
            <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 gap-5 md:mt-12 md:gap-5 lg:grid-cols-3 lg:gap-6">
              {services.map((svc) => (
                <div
                  key={svc.slug}
                  className="flex flex-col overflow-hidden rounded-[18px] bg-white
                             shadow-[0_10px_30px_rgba(0,0,0,0.10)]
                             transition-transform duration-300 hover:-translate-y-1"
                >
                  {/* Top band (lime) */}
                  <div className="bg-[#DAFD82] px-5 py-5">
                    <div className="mb-2 text-[34px] leading-none">{svc.icon}</div>
                    <h3 className="font-['Bricolage_Grotesque'] text-[20px] font-bold leading-tight text-black">
                      {svc.title}
                    </h3>
                    <p className="mt-0.5 font-['Bricolage_Grotesque'] text-[14px] font-medium text-[#3D4038]">
                      Lane handles end-to-end
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {svc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white px-3 py-1
                                     font-['Bricolage_Grotesque'] text-[12px] font-semibold text-[#3D4038]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Body (white) */}
                  <div className="flex flex-1 flex-col px-5 py-5">
                    <ul className="flex flex-col gap-2.5">
                      {svc.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex gap-2 font-['Bricolage_Grotesque'] text-[14px] font-medium leading-[1.35] text-[#1A1A1A]"
                        >
                          <span className="mt-[1px] shrink-0 text-[#00CE84]">✦</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                      <div>
                        <div
                          className="font-['Bricolage_Grotesque'] text-[24px] font-bold leading-none text-black"
                          style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
                        >
                          {svc.price}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 font-['Bricolage_Grotesque'] text-[12px] text-[#6B6F68]">
                          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                          {svc.timeline}
                        </div>
                        <div className="mt-0.5 font-['Bricolage_Grotesque'] text-[12px] text-[#6B6F68]">
                          {svc.noteStar ? "*" : "✓"} {svc.note}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => goToService(svc.slug)}
                        className="shrink-0 rounded-full bg-[#DAFD82] px-5 py-2.5
                                   font-['Bricolage_Grotesque'] text-[14px] font-bold text-black
                                   transition-transform duration-200 hover:scale-[1.03]"
                      >
                        Start now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-12 rounded-[18px] bg-white/90 px-6 py-12 text-center">
              <p className="font-['Bricolage_Grotesque'] text-[18px] font-semibold text-[#1A1A1A]">
                No services match "{query}".
              </p>
              <p className="mt-2 font-['Bricolage_Grotesque'] text-[15px] text-[#6B6F68]">
                Try a different keyword, or clear the search to browse all services.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ================= FAQ ================= */}
      <div className="mx-auto w-full max-w-[1100px] px-5 py-14 md:py-20">
        <div className="text-center">
          <h2
            className="font-['Bricolage_Grotesque'] font-bold leading-tight text-black
                       text-[clamp(26px,3.2vw,40px)]"
          >
            Frequently Asked Questions
          </h2>
          <p
            className="mx-auto mt-3 max-w-[560px] font-['Bricolage_Grotesque'] font-medium
                       leading-[1.4] text-[#6B6F68] text-[clamp(14px,1.6vw,18px)]"
          >
            Everything about DL &amp; RC services — answered.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-1 items-start gap-3 md:mt-12 md:grid-cols-2 md:gap-4">
          <div className="flex flex-col gap-3 md:gap-4">
            {faqsLeft.map((faq, index) => {
              const faqId = `left-${index}`;
              return (
                <RTOFAQItem
                  key={faqId}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFaq === faqId}
                  onToggle={() =>
                    setOpenFaq(openFaq === faqId ? null : faqId)
                  }
                />
              );
            })}
          </div>

          <div className="flex flex-col gap-3 md:gap-4">
            {faqsRight.map((faq, index) => {
              const faqId = `right-${index}`;
              return (
                <RTOFAQItem
                  key={faqId}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFaq === faqId}
                  onToggle={() =>
                    setOpenFaq(openFaq === faqId ? null : faqId)
                  }
                />
              );
            })}
          </div>
        </div>

        {/* "Didn't find your answer?" → opens the RTO lead modal */}
        <div className="mt-10 flex flex-col items-center gap-4 md:mt-12">
          <p className="font-['Bricolage_Grotesque'] font-medium text-[#6B6F68] text-[clamp(14px,1.6vw,18px)]">
            Still have questions? We're here 24/7.
          </p>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="rounded-full border-[3px] border-white
                       bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                       px-8 py-3.5 font-['Bricolage_Grotesque'] font-bold text-white
                       shadow-[0_10px_28px_rgba(0,0,0,0.14)]
                       transition-transform duration-300 hover:scale-[1.02]
                       text-[clamp(15px,1.8vw,19px)]"
          >
            Didn't find your answer?
          </button>
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <RTOFooter />

      {/* ================= "GET A CALLBACK" MODAL ================= */}
      <RTOLeadModal open={chatOpen} onClose={() => setChatOpen(false)} />
    </section>
  );
}
