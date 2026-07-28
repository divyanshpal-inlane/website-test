import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Clock,
  ListChecks,
  AlertCircle,
  ArrowLeft,
  User,
  Car,
  Check,
} from "lucide-react";
import Navbar2 from "../components/Navbar";
import Footer from "../components/Footer";
import RTOLeadModal from "../components/RTOLeadModal";
import SEOHead from "../components/SEOHead";
import { getServiceBySlug, servicesByCategory } from "../data/rtoServicesData";
import { getServiceContent } from "../data/rtoServiceContent";

/**
 * RTOServiceDetailPage
 * ---------------------------------------------------------------------------
 * One dynamic page for all RTO services — mirrors the LocationPage.jsx
 * pattern (useParams + a keyed content lookup) instead of hand-building a
 * page per service.
 *
 * Route:   /rto-services/:serviceSlug
 * Card data:    ../data/rtoServicesData.js   (getServiceBySlug)
 * Detail data:  ../data/rtoServiceContent.js (getServiceContent)
 * ---------------------------------------------------------------------------
 */

/**
 * CheckEligibility
 * Interactive checker: a question, selectable option pills, and a result box
 * that updates on selection. Rendered only when a service defines `eligibility`.
 */
const ELIGIBILITY_TONES = {
  ok: "border-[#00CE84] bg-[rgba(0,206,132,0.10)]",
  warn: "border-[#FF9122] bg-[rgba(255,231,110,0.29)]",
  info: "border-[#8CA0B3] bg-[rgba(140,160,179,0.12)]",
};

function CheckEligibility({ eligibility }) {
  const [selected, setSelected] = useState(null);
  const result =
    selected !== null
      ? eligibility.options[selected].result
      : eligibility.defaultResult;
  const tone =
    selected !== null
      ? eligibility.options[selected].tone || "warn"
      : eligibility.defaultTone || "warn";

  return (
    <section className="mb-10">
      <h2 className="mb-6 text-center font-['Bricolage_Grotesque'] font-bold text-black text-[clamp(24px,3.2vw,32px)]">
        Check Your Eligibility
      </h2>

      <p className="mb-3 font-['Bricolage_Grotesque'] font-semibold text-black text-[clamp(16px,1.8vw,20px)]">
        {eligibility.question}
      </p>

      <div className="flex flex-wrap gap-2.5">
        {eligibility.options.map((opt, i) => {
          const active = selected === i;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(i)}
              className={`rounded-[8px] border px-4 py-2.5 font-['Bricolage_Grotesque'] font-medium
                          text-[14px] md:text-[15px] transition-colors ${
                            active
                              ? "border-[#00CE84] bg-[#DAFD82] font-semibold text-black"
                              : "border-[#939393] bg-white text-black hover:border-[#00CE84]"
                          }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {result && (
        <div
          className={`mt-5 rounded-[16px] border px-5 py-4 ${
            ELIGIBILITY_TONES[tone] || ELIGIBILITY_TONES.warn
          }`}
        >
          <p className="font-['Bricolage_Grotesque'] font-bold text-black text-[15px] md:text-[16px]">
            {result.title}
          </p>
          <p className="mt-1 font-['Bricolage_Grotesque'] font-medium leading-[1.5] text-[#3D4038] text-[14px] md:text-[15px]">
            {result.body}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * HowItWorks
 * Horizontal actor timeline (LANE / YOU / RTO / DONE) with day badges, plus the
 * generic timeline disclaimer. Steps come from `content.howItWorks`.
 */
const HIW_ACTORS = {
  LANE: { circle: "#00CE84", label: "text-[#00CE84]", type: "lane" },
  YOU: { circle: "#D1B3FF", label: "text-[#9B7EDE]", type: "user" },
  RTO: { circle: "#FF9122", label: "text-[#FF9122]", type: "car" },
  DONE: { circle: "#00CE84", label: "text-[#00CE84]", type: "check" },
};

function HiwIcon({ type }) {
  if (type === "lane")
    return (
      <img src="/LANE_LOGO_White.svg" alt="" className="h-[26px] w-[26px]" />
    );
  if (type === "user")
    return <User className="h-6 w-6 text-white" strokeWidth={2.4} />;
  if (type === "car")
    return <Car className="h-6 w-6 text-white" strokeWidth={2.2} />;
  return <Check className="h-7 w-7 text-white" strokeWidth={3} />;
}

function HowItWorks({ steps }) {
  return (
    <section className="mb-10">
      <h2 className="mb-9 text-center font-['Bricolage_Grotesque'] font-bold text-black text-[clamp(24px,3.2vw,32px)] md:mb-12">
        How It Works
      </h2>

      <ol className="flex flex-col gap-8 md:flex-row md:gap-0">
        {steps.map((s, i) => {
          const a = HIW_ACTORS[s.actor] || HIW_ACTORS.LANE;
          return (
            <li
              key={i}
              className="relative flex flex-1 flex-col items-center text-center"
            >
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-[28px] -z-0 hidden w-full border-t-2 border-dashed border-[#D8DBD4] md:block"
                />
              )}
              <span
                className="relative z-10 flex h-[56px] w-[56px] items-center justify-center rounded-full"
                style={{ backgroundColor: a.circle }}
              >
                <HiwIcon type={a.type} />
              </span>
              <span
                className={`mt-3 font-['Bricolage_Grotesque'] text-[15px] font-bold uppercase tracking-[0.02em] ${a.label}`}
              >
                {s.actor}
              </span>
              <p className="mt-1 max-w-[18ch] font-['Bricolage_Grotesque'] text-[14px] font-medium leading-[1.3] text-black md:text-[15px]">
                {s.desc}
              </p>
              <span className="mt-2.5 rounded-full bg-[#D6F5E3] px-3 py-1 font-['Bricolage_Grotesque'] text-[12px] font-semibold text-[#1A1A1A]">
                {s.day}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Timeline disclaimer (generic) */}
      <div className="mt-10 rounded-[16px] border border-[#e8e8e4] px-5 py-5 md:mt-14 md:px-6">
        <p className="font-['Bricolage_Grotesque'] text-[16px] font-bold text-black">
          Timeline Disclaimer
        </p>
        <p className="mt-1.5 font-['Bricolage_Grotesque'] text-[14px] font-medium leading-[1.55] text-[#3D4038] md:text-[15px]">
          The timelines shown are estimates based on average Karnataka RTO
          processing speeds. Actual turnaround may vary due to RTO backlogs,
          public holidays, or document re-verification. Lane actively follows up
          and will keep you updated via WhatsApp.
        </p>
      </div>
    </section>
  );
}

export default function RTOServiceDetailPage() {
  const { serviceSlug } = useParams();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);

  const service = getServiceBySlug(serviceSlug);
  const content = getServiceContent(serviceSlug);

  // SPA nav from the catalogue keeps the old scroll position — force top on every slug change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [serviceSlug]);

  // Unknown slug — don't crash, point the user back to the catalogue.
  if (!service || !content) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar2
          backgroundColor="#FFFFFF"
          logo="/LANE_LOGO.svg"
          burgerMenu="/rto-hamburger.svg"
        />
        <div className="mx-auto flex max-w-[600px] flex-col items-center gap-4 px-5 py-24 text-center">
          <h1 className="font-['Bricolage_Grotesque'] text-[28px] font-bold text-black">
            We couldn't find that service.
          </h1>
          <p className="font-['Bricolage_Grotesque'] text-[15px] text-[#6B6F68]">
            It may have been renamed or moved. Browse the full list of RTO
            services below.
          </p>
          <Link
            to="/rto-services-k9x24qz7"
            className="mt-2 rounded-full bg-[#00CE84] px-6 py-3 font-['Bricolage_Grotesque'] font-bold text-white"
          >
            View all services
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  // A few related cards from the same category, excluding the current one.
  const related = (servicesByCategory[service.category] || [])
    .filter((s) => s.slug !== service.slug)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title={service.metaTitle}
        description={service.metaDescription}
        ogImage="/LANE_LOGO.svg"
        canonical={`/rto-services-k9x24qz7/${service.slug}`}
      />

      <Navbar2
        backgroundColor="#FFFFFF"
        logo="/LANE_LOGO.svg"
        burgerMenu="/rto-hamburger.svg"
      />

      {/* ================= HEADER ================= */}
      <div className="w-full bg-[#00CE84]">
        {/* darker top strip — back to catalogue */}
        <div className="bg-black/10">
          <div className="mx-auto max-w-[1000px] px-5 py-3.5 md:py-4">
            <button
              type="button"
              onClick={() => navigate("/rto-services-k9x24qz7")}
              className="flex items-center gap-2 font-['Bricolage_Grotesque'] text-[15px] font-semibold text-white transition-opacity hover:opacity-80 md:text-[17px]"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
              All services
            </button>
          </div>
        </div>

        {/* centered title + subtitle + chips + price */}
        <div className="mx-auto max-w-[760px] px-5 pb-10 pt-8 text-center md:pb-14 md:pt-12">
          {/* Title with lime brush highlight */}
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
                         text-[clamp(28px,4vw,48px)]"
              style={{ fontVariationSettings: '"opsz" 14, "wdth" 100' }}
            >
              {service.title}
            </span>
          </span>

          {service.subtitle && (
            <p className="mx-auto mt-6 max-w-[620px] font-['Bricolage_Grotesque'] font-medium leading-[1.35] text-black text-[clamp(16px,1.8vw,22px)]">
              {service.subtitle}
            </p>
          )}

          {/* chips (centered) */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 md:mt-8">
            <span className="rounded-full bg-[#D9FF7A] px-4 py-1.5 font-['Bricolage_Grotesque'] text-[14px] font-semibold text-black">
              {content.timeline}
            </span>
            <span className="rounded-full border border-[#E8E7D9] bg-white px-4 py-1.5 font-['Bricolage_Grotesque'] text-[14px] font-semibold text-black">
              {service.price}
            </span>
            {content.documents?.length > 0 && (
              <span className="rounded-full border border-[#E8E7D9] bg-white px-4 py-1.5 font-['Bricolage_Grotesque'] text-[14px] font-semibold text-black">
                {content.documents.length} docs
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ================= BODY (top: eligibility + when applicable) ================= */}
      <div className="mx-auto max-w-[900px] px-5 pt-12 md:pt-16">
        {/* Check Your Eligibility (only when the service defines it) */}
        {content.eligibility && (
          <CheckEligibility eligibility={content.eligibility} />
        )}

        {content.pricingNote && (
          <div className="mb-8 flex items-start gap-3 rounded-[14px] bg-[#F1FFCF] px-5 py-4">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-[#3D4038]"
              strokeWidth={2}
            />
            <p className="font-['Bricolage_Grotesque'] text-[14px] text-[#3D4038]">
              {content.pricingNote}
            </p>
          </div>
        )}

        {/* When is it applicable */}
        {/* <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-['Bricolage_Grotesque'] text-[22px] font-bold text-black md:text-[26px]">
            <ListChecks className="h-5 w-5 text-[#00CE84]" strokeWidth={2.4} />
            When is it applicable?
          </h2>
          <ul className="space-y-2.5">
            {content.whenApplicable.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 font-['Bricolage_Grotesque'] text-[15px] leading-[1.5] text-[#1A1A1A]"
              >
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#00CE84]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section> */}
      </div>

      {/* ================= DOCUMENTS NEEDED (full-width cream band) ================= */}
      {content.documents?.length > 0 && (
        <div className="w-full bg-[#FFFEEB] py-14 md:py-20">
          <div className="mx-auto w-full max-w-[1120px] px-5">
            <div className="text-center">
              <h2 className="font-['Bricolage_Grotesque'] font-bold text-black text-[clamp(26px,3.2vw,40px)]">
                Documents Needed
              </h2>
              <p className="mx-auto mt-3 max-w-[620px] font-['Bricolage_Grotesque'] font-medium leading-[1.4] text-[#3D4038] text-[clamp(14px,1.6vw,18px)]">
                Phone photos are fine. Clear photos of your documents — no
                scanning or couriering originals needed upfront.
              </p>
            </div>

            <div className="mt-9 flex flex-wrap justify-center gap-3.5 md:mt-12 md:gap-4">
              {content.documents.map((doc) => (
                <div
                  key={doc.name}
                  className="flex min-h-[140px] w-[calc(50%-7px)] flex-col rounded-[8px] border border-black bg-[rgba(217,255,122,0.6)] px-5 py-5 sm:w-[168px] md:min-h-[160px] md:w-[188px] md:py-6 lg:w-[196px]"
                >
                  <span
                    className={`font-['Bricolage_Grotesque'] text-[12px] font-bold uppercase tracking-[0.06em] ${
                      doc.status === "REQUIRED"
                        ? "text-[#009761]"
                        : "text-[#313A46]"
                    }`}
                  >
                    {doc.status}
                  </span>
                  <span className="mt-3 font-['Bricolage_Grotesque'] text-[17px] font-bold leading-[1.25] text-black md:text-[19px]">
                    {doc.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= BODY (process onward) ================= */}
      <div className="mx-auto max-w-[900px] px-5 pb-12 pt-12 md:pb-16 md:pt-16">
        {/* How It Works timeline + disclaimer */}
        {content.howItWorks?.length > 0 && (
          <HowItWorks steps={content.howItWorks} />
        )}

        {/* "Not ready to pay" CTA */}
        <div className="mb-10 flex flex-col gap-4 rounded-[16px] bg-[#20CD87] px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="font-['Bricolage_Grotesque'] text-[18px] font-bold text-white md:text-[20px]">
              Still Confused?
            </p>
            <p className="mt-1 font-['Bricolage_Grotesque'] text-[14px] font-medium leading-[1.4] text-white/90 md:text-[15px]">
              Leave your number — we'll call and help you apply when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="shrink-0 self-start rounded-[10px] bg-white px-6 py-3 font-['Bricolage_Grotesque'] text-[15px] font-bold text-black transition-transform duration-200 hover:scale-[1.02] md:self-auto md:text-[16px]"
          >
            Talk to an expert
          </button>
        </div>

        {/* Timeline & notes */}
        {/* <section className="mb-10 rounded-[16px] border border-[#e8e8e4] px-5 py-5">
          <div className="flex flex-wrap items-center gap-2 font-['Bricolage_Grotesque'] text-[16px] font-bold text-black">
            <Clock className="h-4 w-4 text-[#00CE84]" strokeWidth={2.4} />
            Timeline: {content.timeline}
          </div>
          {content.note && (
            <p className="mt-2 font-['Bricolage_Grotesque'] text-[13px] leading-[1.5] text-[#6B6F68]">
              {content.note}
            </p>
          )}
        </section> */}

        {/* CTA */}
        {/* <div className="flex flex-col items-center gap-3 rounded-[20px] bg-[#20CD87] px-6 py-8 text-center">
          <p className="font-['Bricolage_Grotesque'] text-[18px] font-bold text-black md:text-[20px]">
            Ready to get your {service.title.toLowerCase()} sorted?
          </p>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="rounded-full border-[3px] border-white bg-black px-8 py-3 font-['Bricolage_Grotesque'] text-[15px] font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
          >
            Start now — {service.price}
          </button>
        </div> */}

        {/* Related services */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-5 font-['Bricolage_Grotesque'] text-[18px] font-bold text-black md:text-[20px]">
              Other {service.category} services
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/rto-services-k9x24qz7/${r.slug}`}
                  className="flex flex-col gap-2 rounded-[14px] border border-[#e8e8e4] px-4 py-4 transition-colors hover:border-[#00CE84]"
                >
                  <div className="text-[22px]">{r.icon}</div>
                  <div className="font-['Bricolage_Grotesque'] text-[14px] font-bold text-black">
                    {r.title}
                  </div>
                  <div className="font-['Bricolage_Grotesque'] text-[12px] text-[#6B6F68]">
                    {r.price} · {r.timeline}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <RTOLeadModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        service={service.title}
      />
      <Footer />
    </div>
  );
}
