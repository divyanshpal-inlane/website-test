import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Star } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import CountUp from "../components/CountUp";
import testimonialsData from "../data/testimonials";

const stats = [
  { value: 4000,  suffix: "+", decimals: 0, label: "Confident Learners", bg: "#6BECFF", text: "#000000" },
  { value: 37000, suffix: "+", decimals: 0, label: "Hours on road",      bg: "#B28FFF", text: "#000000" },
  { value: 60,    suffix: "+", decimals: 0, label: "Vetted Instructors",  bg: "#FFC229", text: "#000000" },
  { value: 4.7,   suffix: "★", decimals: 1, label: "Star rated",         bg: "#00CE84", text: "#000000" },
  { value: 15,    suffix: "+", decimals: 0, label: "RTO services",       bg: "#D9FF7A", text: "#000000" },
];

const hours = [
  { n: 1, title: "Get to know your car", sections: [
    "Get to know: Your car controls, the dashboard and the gearbox.",
    "Learn how to prepare before starting the car",
    "Start, Drive forward, and Stop the car",
  ]},
  { n: 2, title: "Master the art of balancing the three pedals", sections: [
    "Understanding clutch, brake, and accelerator",
    "Practice pedal coordination",
    "Smooth transitions between pedals",
    "Basic control exercises",
  ]},
  { n: 3, title: "The gearbox and steering control", sections: [
    "Understanding gear patterns",
    "When and how to change gears",
    "Basic steering techniques",
    "Coordination of gears with steering",
  ]},
  { n: 4, title: "Conquer parking with confidence!", sections: [
    "Forward and reverse parking basics",
    "Parallel parking techniques",
    "Parking in tight spaces",
    "Spatial awareness practice",
  ]},
  { n: 5, title: "Drive at consistent speed and hit the slopes", sections: [
    "Speed control techniques",
    "Uphill and downhill driving",
    "Managing gear changes on slopes",
    "Maintaining steady pace",
  ]},
  { n: 6, title: "Navigating the main road with ease!", sections: [
    "Main road driving basics",
    "Traffic signal navigation",
    "Lane discipline",
    "Basic road rules and etiquette",
  ]},
  { n: 7, title: "Conquer city driving with confidence!", sections: [
    "Navigating busy streets",
    "Handling intersections",
    "City traffic management",
    "Defensive driving basics",
  ]},
  { n: 8, title: "You will start believing in your driving skills", sections: [
    "Building confidence in traffic",
    "Advanced maneuvers",
    "Independent driving practice",
    "Handling various road situations",
  ]},
  { n: 9, title: "Getting comfortable with the flyovers!", sections: [
    "Flyover entry and exit techniques",
    "Merging with flyover traffic",
    "Managing speed on flyovers",
    "Safe lane changing on flyovers",
  ]},
  { n: 10, title: "Final lap", sections: [
    "Comprehensive driving review",
    "Final assessment",
    "Test preparation tips",
    "Confidence building exercises",
  ]},
];

const features = [
  { icon: "👤", label: "Just you & your instructor" },
  { icon: "📍", label: "Pick up and Drop from door step" },
  { icon: "⏰", label: "Flexible Timings" },
  { icon: "📋", label: "End to end RTO assistance" },
];

const peopleWhoWereHere = [
  {
    name: "Ambika Sur",
    // tag: "From Scratch To Traffic Jams",
    hook: "By hour ten, she was driving through traffic.",
    comment:
      "Ambika started knowing nothing at all. By her tenth class she was on main roads and getting through traffic jams — something she never thought she'd manage. Her instructor, Richard Paul J, was patient the whole way, explained things clearly, and made her comfortable enough to actually learn. The confidence came along with the skill.",
    rating: 5,
  },
  {
    name: "Sanjay",
    hook: "He had a licence. He still needed the ten hours.",
    comment:
      "Sanjay bought a new car and realised the licence in his pocket wasn't enough. He chose Lane because he could see the full course upfront — no chasing anyone to find out what was happening next. Suraj worked around his schedule, built his confidence, and taught him things he'd never been taught the first time round.",
    rating: 5,
  },
  {
    name: "Douly",
    hook: "The road used to scare her. Not anymore.",
    comment:
      "Douly had been genuinely frightened of driving on the road. What changed it was Rewanth — an instructor who stayed calm no matter what happened and explained everything properly. He got her ready for the DL test too. Her words: the best instructor you can have in Bangalore.",
    rating: 5,
  },
];

const checks = [
  {
    n: "01",
    bg: "#6BECFF",
    q: "Can they teach?",
    text: "We watch how they handle someone who's frozen at a junction. Being a good driver and being a good teacher are not the same thing.",
  },
  {
    n: "02",
    bg: "#FFC229",
    q: "Can they drive?",
    text: "Someone from Lane sits in the car with them. We check how they drive before anyone else does.",
  },
  {
    n: "03",
    bg: "#B28FFF",
    q: "Are they who they say?",
    text: "Licence and car papers checked against official records. Checked again when they expire.",
  },
];

const quizQuestions = [
  {
    question:
      "You reach a crossroads with no signal and no signs. A car arrives from your right at the same time. Who goes first?",
    options: [
      "You do your road is wider",
      "The car on your right",
      "Whoever flashes their lights first",
      "Whoever got there a second earlier",
    ],
    correct: 1,
    explanation:
      "The car on your right goes first. Not the wider road, not the one who flashes those are just habits people picked up. This is the actual rule.",
  },
  {
    question:
      "You're merging onto a busy main road from a side street. Who has the right of way?",
    options: [
      "You, if you signal early",
      "Traffic already on the main road",
      "Whoever is moving faster",
      "The bigger vehicle",
    ],
    correct: 1,
    explanation:
      "Vehicles already on the main road always have priority. Signaling doesn't grant you the right of way, it just tells others what you intend to do.",
  },
  {
    question:
      "A pedestrian is waiting to cross at an unmarked crossing. What's the rule?",
    options: [
      "They wait for a gap in traffic",
      "Pedestrians always get priority",
      "Only if there's a zebra crossing",
      "Depends on the traffic police",
    ],
    correct: 1,
    explanation:
      "Pedestrians have the right of way at any crossing point, marked or not. Most drivers only slow down for zebra crossings, that's the wrong habit.",
  },
  {
    question: "You're on a roundabout. Who should you give way to?",
    options: [
      "Vehicles entering the roundabout",
      "Vehicles already on the roundabout",
      "Whoever is on the inner lane",
      "Larger vehicles",
    ],
    correct: 1,
    explanation:
      "Traffic already inside the roundabout has priority. You give way before entering, not after.",
  },
  {
    question:
      "Two vehicles approach a narrow bridge from opposite ends at the same time. Who goes first?",
    options: [
      "Whoever honks first",
      "The vehicle that arrived first",
      "The vehicle going downhill",
      "The larger vehicle",
    ],
    correct: 1,
    explanation:
      "First to arrive gets to cross first. Honking or vehicle size doesn't decide it, arrival order does.",
  },
];

const MarkerHeading = ({ children, className = "" }) => (
  <span className={`relative inline-block -rotate-1 px-6 py-2 sm:px-8 sm:py-3 ${className}`}>
    <span
      aria-hidden="true"
      className="absolute inset-0 bg-[#00CE84]"
      style={{
        WebkitMaskImage: "url('/Tag5.svg')",
        WebkitMaskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskImage: "url('/Tag5.svg')",
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
      }}
    />
    <span
      className="relative font-['Bricolage_Grotesque'] font-extrabold text-white text-[24px] sm:text-[34px] md:text-[40px]"
      style={{ WebkitTextStroke: "1.5px black", paintOrder: "stroke fill" }}
    >
      {children}
    </span>
  </span>
);

function HourAccordionItem({ hour, isOpen, onToggle }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-black bg-[#D9FF7A]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-5 py-3 text-left sm:px-6 sm:py-3.5"
      >
        <span className="font-['Bricolage_Grotesque'] font-bold text-black text-[14px] sm:text-[16px] whitespace-nowrap">
          Hour {hour.n}
        </span>
        <span className="text-black/50">|</span>
        <span className="flex-1 font-['Bricolage_Grotesque'] font-bold text-black text-[14px] sm:text-[16px]">
          {hour.title}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-black transition-transform duration-300 ${
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
          <div className="px-5 pb-4 pt-1 sm:px-6 flex flex-col">
            {hour.sections.map((item, i) => (
              <div key={i}>
                {i > 0 && <div className="border-t border-black/10" />}
                <p className="py-2.5 font-['Bricolage_Grotesque'] font-medium text-black/80 text-[13px] sm:text-[14px] leading-relaxed">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StarRating({ rating }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {Array.from({ length: rating }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-[#FFC229] text-[#FFC229]" />
      ))}
    </span>
  );
}

function ReviewCard({ testimonial, bg = "#FFFFFF", border = true, className = "" }) {
  return (
    <div
      className={`min-h-[250px] sm:min-h-[280px] md:min-h-[300px] flex flex-col overflow-hidden rounded-[16px] p-6 ${border ? "border border-black" : ""} ${className}`}
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between mb-3 shrink-0 gap-3">
        <h3 className="font-['Bricolage_Grotesque'] font-bold text-black text-[16px]">
          {testimonial.name}
        </h3>
        <StarRating rating={testimonial.rating} />
      </div>
      {testimonial.hook && (
        <p className="mb-2 font-['Bricolage_Grotesque'] font-bold text-black text-[14px] leading-snug">
          {testimonial.hook}
        </p>
      )}
      <p className="font-['Bricolage_Grotesque'] text-black text-[13px] leading-relaxed line-clamp-6">
        {testimonial.comment}
      </p>
      {testimonial.tag && (
        <p className="mt-3 font-['Bricolage_Grotesque'] font-extrabold uppercase tracking-[0.04em] text-[#00CE84] text-[12px]">
          {testimonial.tag}
        </p>
      )}
    </div>
  );
}

const ThankYou = () => {
  const [openHour, setOpenHour] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  const currentQuestion = quizQuestions[quizIndex];

  const selectOption = (optionIndex) => {
    if (selectedOption !== null) return;
    setSelectedOption(optionIndex);
    if (optionIndex === currentQuestion.correct) {
      setScore((s) => s + 1);
    }
  };

  const goNext = () => {
    if (selectedOption === null) return;
    if (quizIndex === quizQuestions.length - 1) {
      setQuizDone(true);
      return;
    }
    setQuizIndex((i) => i + 1);
    setSelectedOption(null);
  };

  return (
    <>
      <ScrollToTop />
      <Navbar backgroundColor="#FAF9E6" logo="./LANE_LOGO.svg" burgerMenu="/PurpleHamburger.png" />

      {/* ============ HERO (cream bg, down through the curve) ============ */}
      <div className="w-full bg-[#FAF9E6]">
        <div className="relative w-full pt-10 sm:pt-14 md:pt-16 overflow-hidden">
          {/* Row: traffic light on left edge, sets the row height */}
          <div className="flex flex-row items-center">
            <img
              src="/traffic-light.svg"
              alt="Green light"
              className="w-[320px] sm:w-[260px] md:w-[320px] h-auto shrink-0 -ml-6 sm:-ml-10 md:-ml-14 lg:-ml-20 drop-shadow-xl"
            />
          </div>
          {/* Text: below the traffic light on mobile; centred overlay on sm+ */}
          <div className="mt-10 sm:mt-0 sm:absolute sm:inset-0 flex flex-col items-center justify-center text-center px-4">
            <h1 className="font-['Bricolage_Grotesque'] font-bold text-[#3C4856] leading-tight text-[42px] sm:text-[46px] md:text-[56px] lg:text-[62px]">
              Thank You For
            </h1>
            <h1 className="font-['Bricolage_Grotesque'] font-extrabold text-[#00CE84] leading-tight text-[46px] sm:text-[52px] md:text-[62px] lg:text-[70px]">
              Choosing Lane!
            </h1>
            <p className="mt-3 font-['Bricolage_Grotesque'] font-semibold text-[#3C4856] text-[17px] sm:text-[22px] md:text-[24px]">
              Our team will call you within 30 minutes.
            </p>
          </div>
        </div>

        {/* ---------- STAT CARDS (sit along the curve) ---------- */}
        <div className="relative w-full overflow-hidden mt-12 sm:mt-16 pb-10 sm:pb-[220px]">
          {/* Arch curve — peek out from below the cards (sm+ only) */}
          <img
            src="/Union.svg"
            alt=""
            aria-hidden="true"
            className="hidden sm:block absolute inset-x-0 z-0 pointer-events-none select-none"
            style={{
              top: "60px",
              width: "100%",
              height: "420px",
              objectFit: "fill",
              WebkitMaskImage: "linear-gradient(to bottom, black 35%, transparent 85%)",
              maskImage: "linear-gradient(to bottom, black 35%, transparent 85%)",
            }}
          />
          <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative z-10 grid grid-cols-2 justify-items-center gap-4 my-8 sm:my-0 sm:flex sm:flex-row sm:flex-wrap sm:justify-center items-start sm:gap-5 md:gap-6">
              {stats.map((stat, index) => {
                const center = (stats.length - 1) / 2;
                const distance = Math.abs(index - center);
                // steeper curve drop for outer cards
                const curveOffset = Math.round(distance * distance * 18);
                const rotation = index % 2 === 0 ? -3 : 3;
                const isLast = index === stats.length - 1;
                return (
                  <div
                    key={stat.label}
                    className={`flex flex-col items-center justify-center rounded-[16px] border border-black
                               px-5 py-5 sm:px-6 sm:py-5
                               shadow-[4px_6px_0px_rgba(0,0,0,0.25)]
                               sm:[transform:translateY(var(--card-ty))_rotate(var(--card-rot))]
                               ${isLast ? "col-span-2" : ""}`}
                    style={{
                      backgroundColor: stat.bg,
                      color: stat.text,
                      minWidth: "140px",
                      "--card-ty": `${curveOffset}px`,
                      "--card-rot": `${rotation}deg`,
                    }}
                  >
                    <span
                      className="font-['Bricolage_Grotesque'] font-extrabold text-[26px] sm:text-[24px] md:text-[28px] whitespace-nowrap"
                      style={{ color: stat.text }}
                    >
                      <CountUp target={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                    </span>
                    <span
                      className="font-['Bricolage_Grotesque'] font-medium text-[13px] sm:text-[13px] mt-1 whitespace-nowrap"
                      style={{ color: stat.text }}
                    >
                      {stat.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============ REST OF PAGE (same cream bg, no seam) ============ */}
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ---------- YOU'RE NOT BEHIND ---------- */}
          <div className="relative z-10 mt-6 sm:-mt-10 text-center">
            <MarkerHeading>You're Not Behind</MarkerHeading>
          </div>

          <div className="relative z-10 mt-8 rounded-[20px] border border-black bg-white px-6 py-6 sm:px-10 sm:py-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
            <span className="font-['Bricolage_Grotesque'] font-extrabold text-[#00CE84] text-[36px] sm:text-[44px] whitespace-nowrap">
              7 <span className="text-black">IN</span> 10
            </span>
            <p className="font-['Bricolage_Grotesque'] font-medium text-black text-[14px] sm:text-[16px] leading-relaxed">
              of our learners already have a licence and still get nervous behind the
              wheel. Having a licence and feeling safe on the road are two different
              things.
            </p>
          </div>

          {/* ---------- YOUR TEN HOURS ---------- */}
          <div className="relative z-10 mt-8 rounded-[24px] border border-black bg-[#D9FF7A] px-5 py-6 sm:px-8 sm:py-8">
            <h2 className="font-['Bricolage_Grotesque'] font-extrabold text-black text-[24px] sm:text-[30px]">
              ⏰ Your Ten Hours
            </h2>
            <p className="mt-2 font-['Bricolage_Grotesque'] font-medium text-black/80 text-[13px] sm:text-[15px] leading-relaxed max-w-2xl">
              This is the whole course. Hour by hour. Tap any hour to see what you'll
              do in it. Nothing is a surprise, you'll know where you're going before
              you start. 400+ hrs of curriculum design · built with road safety
              researchers
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {hours.map((hour) => (
                <HourAccordionItem
                  key={hour.n}
                  hour={hour}
                  isOpen={openHour === hour.n}
                  onToggle={() => setOpenHour(openHour === hour.n ? null : hour.n)}
                />
              ))}
            </div>
          </div>

          <div className="relative z-10 mt-6 flex justify-center">
            <div className="rounded-full bg-[#00CE84] px-6 py-3 sm:px-8 sm:py-4 text-center">
              <span className="font-['Bricolage_Grotesque'] font-bold text-white text-[14px] sm:text-[17px]">
                🏁 Ten Hours. That's The Distance Between Here And Driving.
              </span>
            </div>
          </div>

          {/* ---------- FEATURES ---------- */}
          <div className="relative z-10 mt-14 sm:mt-16 grid grid-cols-2 sm:flex sm:flex-row justify-center gap-8 sm:gap-14 md:gap-20 pb-10">
            {features.map((feature) => (
              <div key={feature.label} className="flex flex-col items-center text-center gap-2 max-w-[140px]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black bg-white text-[20px]">
                  {feature.icon}
                </div>
                <span className="font-['Bricolage_Grotesque'] font-semibold text-black text-[13px] sm:text-[14px] leading-snug">
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ PEOPLE WHO WERE HERE ============ */}
      <div className="w-full bg-[#00CE84]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="flex flex-col md:flex-row gap-8 md:gap-10 items-start">
            <div className="md:w-[280px] shrink-0">
              <h2 className="font-['Bricolage_Grotesque'] font-extrabold text-black text-[28px] sm:text-[34px] leading-tight">
                People Who Were Here
              </h2>
              <p className="mt-4 font-['Bricolage_Grotesque'] font-medium text-black text-[14px] sm:text-[15px] leading-relaxed">
                Three learners. Same starting point as you. Every one of them was
                nervous on day one. Here's where they got to.
              </p>
            </div>
            <div className="flex-1 min-w-0 w-full overflow-hidden">
              <motion.div
                className="flex gap-4"
                style={{ width: "max-content" }}
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 30, ease: "linear", repeat: Infinity }}
              >
                {[...peopleWhoWereHere, ...peopleWhoWereHere].map((t, i) => (
                  <ReviewCard
                    key={`${t.name}-${i}`}
                    testimonial={t}
                    bg="#FFFFFF"
                    className="shrink-0 w-[260px] sm:w-[300px] md:w-[320px]"
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ WHO IS BESIDE YOU ============ */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 text-center">
        <MarkerHeading>Who Is Beside You?</MarkerHeading>
        <p className="mt-5 font-['Bricolage_Grotesque'] font-semibold text-black text-[14px] sm:text-[17px]">
          Nobody teaches at Lane until they've passed all three checks. The last one
          matters most.
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
          {checks.map((check) => (
            <div
              key={check.n}
              className="relative rounded-[16px] border border-black px-6 py-6"
              style={{ backgroundColor: check.bg }}
            >
              <div className="absolute -top-2.5 -right-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#00CE84] border border-black shadow-[2px_3px_0_rgba(0,0,0,0.25)]">
                <span className="text-white font-bold text-[14px]">✓</span>
              </div>
              <span className="font-['Bricolage_Grotesque'] font-bold text-black/70 text-[12px] tracking-wide uppercase">
                Check {check.n}
              </span>
              <h3 className="mt-1 font-['Bricolage_Grotesque'] font-extrabold text-black text-[20px] sm:text-[22px]">
                {check.q}
              </h3>
              <p className="mt-2 font-['Bricolage_Grotesque'] font-medium text-black text-[13px] sm:text-[14px] leading-relaxed">
                {check.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ============ 5 THINGS NOBODY TAUGHT YOU ============ */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-14 sm:pb-16">
        <div className="relative flex flex-col md:flex-row gap-8 md:gap-12 items-start">
          {/* Metal pipe, full-bleed edge to edge (not just the content column) */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 w-screen top-10 sm:top-12 md:top-14 z-0 h-2.5 sm:h-3
                       bg-gradient-to-b from-[#d4d4d4] via-[#f2f2f2] to-[#a3a3a3]
                       shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
          />

          <div className="relative z-10 md:w-[300px] shrink-0 pt-20 sm:pt-24 md:pt-28">
            <h2 className="font-['Bricolage_Grotesque'] font-extrabold text-black text-[26px] sm:text-[32px] leading-tight">
              5 Things Nobody
            </h2>
            <div className="mt-1">
              <MarkerHeading>Taught You</MarkerHeading>
            </div>
            <p className="mt-4 font-['Bricolage_Grotesque'] font-medium text-black text-[14px] sm:text-[15px] leading-relaxed">
              These catch out people who've been driving for twenty years. If you
              don't know them, that's not on you. Nobody teaches this.
            </p>
          </div>

          <div className="relative z-10 flex-1 w-full">
            {!quizDone ? (
              <div className="rounded-[24px] border border-black bg-[#D9FF7A] px-6 py-6 sm:px-8 sm:py-8">
                <div className="rounded-[16px] bg-[#00CE84] border border-black px-5 py-4 sm:px-6 sm:py-5">
                  <p className="font-['Bricolage_Grotesque'] font-bold text-white text-[15px] sm:text-[17px] leading-snug">
                    {currentQuestion.question}
                  </p>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedOption === index;
                    const isCorrectOption = index === currentQuestion.correct;
                    const showCorrect = selectedOption !== null && isCorrectOption;
                    const showWrong = selectedOption !== null && isSelected && !isCorrectOption;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => selectOption(index)}
                        disabled={selectedOption !== null}
                        className="flex items-center gap-3 text-left disabled:cursor-default"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border bg-white ${
                            showCorrect
                              ? "border-[#00CE84]"
                              : showWrong
                                ? "border-red-500"
                                : "border-black"
                          }`}
                        >
                          {showCorrect && (
                            <span className="text-[#00CE84] text-[13px] font-bold">✓</span>
                          )}
                          {showWrong && (
                            <span className="text-red-500 text-[13px] font-bold">✕</span>
                          )}
                        </span>
                        <span className="font-['Bricolage_Grotesque'] font-bold text-black text-[14px] sm:text-[15px]">
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={goNext}
                  disabled={selectedOption === null}
                  className="mt-6 rounded-full bg-[#00CE84] border border-black px-6 py-2 font-['Bricolage_Grotesque'] font-bold text-white text-[14px]
                             transition-colors hover:bg-[#00b574] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {quizIndex === quizQuestions.length - 1 ? "See Score" : "Next"}
                </button>

                {selectedOption !== null && (
                  <p className="mt-4 font-['Bricolage_Grotesque'] font-medium text-black text-[13px] sm:text-[14px] leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-[24px] border border-black overflow-hidden">
                <div className="flex items-center justify-between bg-[#00CE84] px-6 py-4 sm:px-8 sm:py-5">
                  <span className="font-['Bricolage_Grotesque'] font-bold text-white text-[13px] sm:text-[15px]">
                    DONE
                  </span>
                  <span className="font-['Bricolage_Grotesque'] font-extrabold text-white text-[32px] sm:text-[40px]">
                    {score}/{quizQuestions.length}
                  </span>
                  <span className="font-['Bricolage_Grotesque'] font-bold text-white text-[13px] sm:text-[15px]">
                    SCORE {score}
                  </span>
                </div>
                <div className="bg-[#D9FF7A] px-6 py-6 sm:px-8 sm:py-7 text-center">
                  <p className="font-['Bricolage_Grotesque'] font-bold text-black text-[14px] sm:text-[16px] leading-relaxed">
                    {score >= quizQuestions.length - 1
                      ? "That's a sharp score. Most people miss at least two of these."
                      : "That's the normal score. None of this gets taught properly anywhere. It's hour six of your course."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ REVIEWS ROW ============ */}
      <div className="w-full overflow-hidden py-2">
        <motion.div
          className="flex gap-4"
          style={{ width: "max-content" }}
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 90, ease: "linear", repeat: Infinity }}
        >
          {[...testimonialsData, ...testimonialsData].map((t, i) => (
            <ReviewCard
              key={`${t.name}-${i}`}
              testimonial={t}
              bg="#B28FFF"
              border={false}
              className="w-[300px] sm:w-[350px] md:w-[400px] shrink-0"
            />
          ))}
        </motion.div>
      </div>

      {/* ============ FINAL CTA ============ */}
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center">
        <h2 className="font-['Bricolage_Grotesque'] font-extrabold text-[#00CE84] text-[22px] sm:text-[30px]">
          Anything You Want To Ask Before We Call?
        </h2>
        <p className="mt-2 font-['Bricolage_Grotesque'] font-semibold text-black text-[14px] sm:text-[16px]">
          We're On WhatsApp, And We Usually Reply In A Few Minutes.
        </p>
        <a
          href="https://wa.me/916366212914"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#00CE84] px-6 py-3 sm:px-8 sm:py-3.5
                     shadow-[0_10px_28px_rgba(0,0,0,0.14)] transition-all duration-300 hover:scale-[1.02]"
        >
          <span className="text-[18px]">💬</span>
          <span className="font-['Bricolage_Grotesque'] font-bold text-white text-[15px] sm:text-[17px]">
            Chat With Us On WhatsApp
          </span>
        </a>
      </div>

      <Footer />
    </>
  );
};

export default ThankYou;
