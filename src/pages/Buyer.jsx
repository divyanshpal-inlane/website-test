import React from "react";
import { ArrowRight } from "lucide-react";
import BuyerNavbar from "../components/BuyerNavbar";

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

export default function BuyerHeroSection() {
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
    </section>
  );
}
