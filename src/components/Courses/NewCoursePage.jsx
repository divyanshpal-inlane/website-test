import React, { useState, useEffect } from "react";
import Footer from "../Footer";
import FAQ from "./FAQ";
import Navbar from "../Navbar";
import { Button } from "@mui/material";
import { Rocket } from "lucide-react";
import MiniCourseNew from "./MiniCourseNew";
import { Helmet } from "react-helmet-async";
import beginnerCourseHours from "../../data/beginnerCourse";
import { Link } from "react-router-dom";
const NewCoursePage = () => {
  const [expandedHour, setExpandedHour] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const calculateCarPosition = () => {
    const maxScroll = 300;
    const maxMove = window.innerWidth < 768 ? 100 : 200;
    const movement = Math.min((scrollPosition / maxScroll) * maxMove, maxMove);
    return movement;
  };



  return (
    <>
      <Helmet>
        <title>
          Driving Courses - Learn to Drive with InLane | Beginner to Advanced
        </title>
        <meta
          name="description"
          content="Join InLane's comprehensive driving courses. 10-hour beginner course, specialized training modules, and expert instruction. Learn driving with confidence in Bangalore."
        />
        <meta
          name="keywords"
          content="driving course bangalore, learn car driving, beginner driving course, driving lessons near me, driving school courses, car driving training, driving classes bangalore, best driving school"
        />
        {/* Essential meta tags */}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://inlane.in/courses" />

        {/* Open Graph Tags */}
        <meta
          property="og:title"
          content="Professional Driving Courses by InLane - From Basics to Mastery"
        />
        <meta
          property="og:description"
          content="Expert-led driving courses with structured learning modules. 10-hour beginner course, hands-on training, and comprehensive road safety education."
        />
        <meta property="og:url" content="https://inlane.in/courses" />
        <meta property="og:type" content="website" />
      </Helmet>

      <Navbar
        backgroundColor="#00CE84"
        logo="../svg/Logo_white.svg"
        burgerMenu="./svg/burger_menu_white.svg"
      />
      <div className="min-h-screen bg-green-400 font-['glancyr'] px- pb-12 bg-logoGreen">
        {/* Cars Row and Animation Container */}
        <div className="relative h-[300px] md:h-[500px] ">
          {/* Static cars row */}
          <div className="relative w-full pt-12">
            {/* Mobile view cars (3 cars) */}
            <div className="flex justify-center items-center gap-2 md:hidden">
              <img src="/svg/course_car.svg" alt="car" className="w-24" />
              <div className="w-24 min-w-[96px]" /> {/* Reduced space for yellow car */}
              <img src="/svg/course_car.svg" alt="car" className="w-24" />
            </div>

            {/* Desktop view cars (7 cars) */}
            <div className="hidden md:flex justify-center items-center gap-4">
              {Array.from({ length: 7 }, (_, i) =>
                i !== 3 ? (
                  <img
                    key={i}
                    src="/svg/course_car.svg"
                    alt="car"
                    className="w-auto"
                  />
                ) : (
                  <div key={i} className="w-auto min-w-[128px]" />
                )
              )}
            </div>

            {/* Animated yellow car - updated size for mobile */}
            <div
              className="absolute top-12 left-1/2 transform -translate-x-1/2"
              style={{ zIndex: 20 }}
            >
              <img
                src="/svg/course_car_yellow.svg"
                alt="car"
                className="w-24 md:w-auto"
                style={{
                  transform: `translateY(${calculateCarPosition()}px)`,
                  transition: "transform 0.1s ease-out",
                }}
              />
            </div>
          </div>

          {/* Let's Get You Driving image */}
          <div
            className="absolute w-full top-[200px] md:top-[400px]"
            style={{
              // top: "400px",
              zIndex: 10,
            }}
          >
            <img
              src="/course/letgetyoudriving.svg"
              alt="car"
              className="mx-auto w-2/3 md:w-auto "
            />
          </div>
        </div>

        {/* Main Title */}
        {/* <div className="text-center mb-8">
        <h1 className="inline-block bg-yellow-300 px-4 py-2 text-2xl font-bold">
          Let's Get
        </h1>
        <h1 className="inline-block bg-yellow-300 px-4 py-2 text-2xl font-bold ml-1">
          You Driving!
        </h1>
      </div> */}

        {/* <div className="flex justify-center">
        <img src="/course/letgetyoudriving.svg" alt="car" className="" />
      </div> */}

        {/* Beginner Course Section */}
        <div className="max-w-5xl mb-12 md:mx-auto mx-4 md:mb-24 mt-14 md:mt-60
         bg-[#D9FF7A] rounded-[2rem] p-4 md:p-8 shadow-sm relative">
          <div className="flex items-center gap-3 mb-6 md:mb-6 mx-3 mt-4 md:mt-0">
            <img
              src="/course/arrow.svg"
              alt="target"
              className="w-9 md:w-auto"
            />
            <h2 className="text-xl md:text-4xl font-medium font-['glancyr'] text-left md:text-left">
              Comprehensive/Beginner Course
            </h2>
          </div>

          <div className="flex flex-col md:flex-row mx-3">
            {/* Left side - Course hours - full width on mobile, 70% on desktop */}
            <div className="w-full md:w-[70%] space-y-2 md:pr-8 mb-8 md:mb-0 px-2 md:px-20">
              {beginnerCourseHours.map((hour, index) => (
                <div key={index} className="relative">
                  <button
                    onClick={() => setExpandedHour(expandedHour === index ? null : index)}
                    className={`w-full flex items-center justify-between transition-colors rounded-[1rem] px-2 md:px-6 py-1 border border-black 
                      ${expandedHour === index 
                        ? 'bg-[#F1FFCF] rounded-b-none border-b-0 ' 
                        : 'bg-[#D9FF7A]'
                      }`}
                  >
                    <div className="flex items-start gap-1 md:gap-4 flex-1 min-w-0">
                      <span className="font-semibold text-sm md:text-xl whitespace-nowrap text-start"> 
                        <span className="md:hidden">Hr</span><span className="hidden md:inline">Hour</span> {hour.hour}</span>
                      <span className="text-black/50 hidden md:inline">|</span>
                      <span className={`font-semibold text-sm md:text-lg  text-start ${expandedHour === index ? 'whitespace-normal' : 'truncate'}`}>
                        {hour.title}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 md:w-5 md:h-5 transition-transform flex-shrink-0 ml-1 md:ml-2 ${
                        expandedHour === index ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {expandedHour === index && (
                    <div className="bg-[#F1FFCF] rounded-b-[1rem] overflow-hidden border  border-black border-t-black/5 ">
                      {hour.sections.map((section, sectionIndex) => (
                        <div
                          key={sectionIndex}
                          className="px-2 md:px-6 py-2 text-sm md:text-lg md:font-medium border-b border-black/5 last:border-b-0"
                        >
                          {section}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right side - Course details */}
            <div className="w-full md:w-[30%] space-y-4 md:space-y-6 p-2 md:p-0">
              <div className="flex items-center gap-3">
                <img src="/course/timer.svg" alt="duration" className="w-8 md:w-auto" />
                <div className="flex flex-col items-start text-xl md:text-2xl">
                  <span className="font-semibold">Duration:</span>
                  <p className="font-semibold">10 hours</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <img src="/course/coin.svg" alt="price" className="w-8 md:w-auto" />
        <div className="flex flex-col">
          <span className="text-xl md:text-2xl font-semibold">Price:</span>
          <div className="flex items-baseline gap-1">
            <p className="text-xl md:text-2xl font-semibold">₹10,000</p>
            {/* <span className="text-xs align-top">*</span> */}
          </div>
      <p className="text-xs">* with license assistance</p>
        </div>
      </div>
    </div>

              <div className="flex items-start gap-3">
                <img src="/course/calculator.svg" alt="value" className="w-8 md:w-auto" />
                <div>
                  <span className="text-xl md:text-2xl font-semibold">Value Added</span>
                  <p className="text-base md:text-md ">
                    We offer a vehicle  <br />for the Driver's <br /> License test day  <br />at an additional cost.
                  </p>
                </div>
              </div>

              {/* <div className="flex flex-row items-center justify-center w-full mt-6 md:mt-8"> */}
                <div className="flex items-center justify-center md:w-auto">
                  <Link to="/signup">
                        <Button
                                    variant="contained"
                                    startIcon={<img src="/course/rocket.svg" alt="rocket" className="w-6 h-6" />}
                                    sx={{
                                      background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                                      "&:hover": {
                                        background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                                        backgroundColor: "#00CE84",
                                      },
                                      color: "white",
                                      fontWeight: "bold",
                                      textDecoration: "none",
                                      textTransform: "none",
                                      border: "2px solid white",
                                      borderRadius: "50px",
                                      padding: {
                                        xs: "4px 24px",
                                        sm: "10px 20px",
                                        md: "1px 25px",
                                      },
                                      fontFamily: "Bricolage Grotesque",
                                      fontSize: {
                                        xs: "1rem",
                                        sm: "1.125rem",
                                        md: "1.5rem",
                                      },
                                    }}
                                  >
                                    Sign Up
                                  </Button>
                        </Link>
                </div>
              {/* </div> */}
            </div>
          </div>
        </div>

        {/* Mini Course Tag - Positioned between sections */}
        <div className="relative -mb-10 md:-mb-16 z-10">
          <img 
            src="course/minicoursetag.svg" 
            alt="Mini Courses" 
            className="mx-auto w-[300px] md:w-[600px]"
          />
        </div>

        {/* Mini Courses Section */}
        <div className="pt-12 md:pt-24 bg-white ">
          <MiniCourseNew />
        </div>
      </div>
      <FAQ />
      <Footer />
    </>
  );
};

export default NewCoursePage;

