import React from "react";
import { ArrowRight } from "lucide-react";
import BuyerNavbar from "../components/BuyerNavbar";

/**
 * BuyerHeroSection
 * --------------------------------------------------------------------------
 * Figma canvas: 1704 × 1756 total (hero content zone Y=131→1575 = 1444px).
 *
 * Layout strategy:
 *   - Header + road strip are FULL-WIDTH (edge-to-edge)
 *   - Hero content canvas is capped at max-w-[1280px] with aspect-[1704/1444]
 *   - All positions are Figma-accurate percentages
 *   - Mobile: flex-col stacking via order-*
 *   - md+: aspect-ratio locked absolute positioning
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

export default function BuyerHeroSection() {
  return (
    <section className="relative w-full overflow-x-hidden bg-[#F5F5F5]">
      {/* ================= SHARED NAVBAR ================= */}
      {/*
        Same Navbar2 component as Sell page.
        backgroundColor matches the hero bg (#F5F5F5).
        Green hamburger per the Figma design.
        The road strip / divider is rendered by Navbar2 internally.
      */}
      <BuyerNavbar
        backgroundColor="#F5F5F5"
        logo="/LANE_LOGO.svg"
        burgerMenu="/Green-Hamburger.png"
      />

      {/* ================= HERO CONTENT (capped canvas) ================= */}
      {/* -mt-[2px] matches Sell page pattern to seamlessly overlap navbar edge */}
      <div
        className="relative mx-auto flex w-full max-w-[1280px] flex-col
                   -mt-[2px] md:-mt-[4px]
                   pb-6 md:block md:pb-0
                   md:aspect-[1704/1320]"
      >
        {/* ---------------- HEADLINE ---------------- */}
        {/* Figma: X=235(13.8%), contentY=141(9.8%), W=671(39.4%) */}
        <div
          className="relative z-30 order-1 mt-4 w-full px-5 text-center
                     md:absolute md:mt-0 md:px-0 md:text-left
                     md:left-[13.8%] md:top-[9.8%] md:w-[39.4%]"
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

        {/* ---------------- IMAGE STACK ---------------- */}
        {/*
          Figma: X=226(13.3%), contentY=73(5.1%), W=1255(73.7%)
          SCALED DOWN to ~60% width to avoid the images dominating the section.
          The Figma has clear margins on both sides of the car.
        */}
        <div
          className="relative order-2 mx-auto mt-2 w-[85%]
                     aspect-[1255/997]
                     md:absolute md:mt-0
                     md:left-[16%] md:top-[5%] md:w-[62%]"
        >
          {/* Scenery */}
          <img
            src="/scenery.png"
            alt="Scenery"
            className="absolute z-10 h-auto object-cover
                       left-1/2 top-0 w-[52.7%] -translate-x-1/2
                       md:left-[23.6%] md:w-[52.7%] md:translate-x-0"
          />
          {/* Car */}
          <img
            src="/car.png"
            alt="Car"
            className="absolute bottom-0 left-0 z-20 h-auto w-full object-contain"
          />
        </div>

        {/* ---------------- DESCRIPTION ---------------- */}
        {/* Figma: X=958(56.2%), contentY=271(18.8%), W=597(35%) */}
        <div
          className="relative z-30 order-3 mt-4 w-full px-5 text-center
                     md:absolute md:mt-0 md:px-0 md:text-left
                     md:left-[56.2%] md:top-[18.8%] md:w-[35%]"
        >
          <p
            className="font-['Bricolage_Grotesque'] font-medium text-black
                       leading-[140%] md:leading-[130%]
                       text-[13px] sm:text-[15px] md:text-[1.4vw] xl:text-[20px]"
          >
            Think of us as that friend who's obsessed with cars. We'll help you
            pick the right one, get you the best loan rate, sort your insurance
            &amp; handle all the RTO headaches.
          </p>
        </div>

        {/* ---------------- CTA BUTTONS ---------------- */}
        <div
          className="relative z-40 order-4 mt-6 flex w-full flex-col items-center
                      gap-3 px-5
                      sm:flex-row sm:justify-center
                      md:absolute md:mt-0 md:justify-center md:px-0
                      md:left-0 md:right-0 md:top-[70%]
                      md:w-full
                      md:gap-[34px] lg:gap-[42px]"
        >
          {/* Explore Cars */}
          <button
            className="group relative flex items-center justify-center
                       overflow-hidden rounded-full
                       border-[3px] border-white
                       bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                       shadow-[0_10px_28px_rgba(0,0,0,0.14)]
                       transition-all duration-300
                       hover:scale-[1.02]
                       h-[52px] w-full max-w-[250px]
                       sm:h-[56px] sm:max-w-[270px]
                       md:h-[64px] md:w-[300px] md:max-w-none
                       lg:h-[70px] lg:w-[330px]"
          >
            <span
              className="flex items-center gap-2
                         font-['Bricolage_Grotesque']
                         font-bold tracking-[-0.02em]
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
            className="flex items-center justify-center
                       rounded-full
                       border-[3px] border-white
                       bg-white
                       shadow-[0_10px_28px_rgba(0,0,0,0.12)]
                       transition-all duration-300
                       hover:scale-[1.02]
                       h-[52px] w-full max-w-[250px]
                       sm:h-[56px] sm:max-w-[270px]
                       md:h-[64px] md:w-[300px] md:max-w-none
                       lg:h-[70px] lg:w-[330px]"
          >
            <span
              className="font-['Bricolage_Grotesque']
                         font-bold tracking-[-0.02em]
                         text-black
                         text-[15px] sm:text-[16px] md:text-[20px] lg:text-[22px]"
            >
              Let's Chat
            </span>
          </button>
        </div>

        {/* ---------------- SERVICES ---------------- */}
        {/* Figma: X=126(7.4%), contentY=1209(83.7%), W=1453(85.3%) */}
        <div
          className="relative z-40 order-5 mt-12 w-full px-4
             md:absolute md:mt-0 md:px-0
             md:left-[7.4%]
             md:top-[80%]
             md:w-[85.3%]"
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
      </div>
      {/* ================= BOTTOM ACCENT BLOCK ================= */}
      <div className="h-[36px] w-full bg-[#D9FF7A] sm:h-[45px] md:h-[60px] lg:h-[80px] xl:h-[100px]" />
    </section>
  );
}
