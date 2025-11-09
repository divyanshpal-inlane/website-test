import React, { useState, useEffect } from "react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useParams } from "react-router-dom";
import SEOHead from "../components/SEOHead";
import { getLocationSEO } from "../utils/seoData";
import BenefitsSplitLayout from "../components/SwipableBenefits";
import { Button } from "@mui/material";
import { Rocket } from "lucide-react";
import MiniCourseNew from "../components/Courses/MiniCourseNew";
import beginnerCourseHours from "../data/beginnerCourse";
import { motion, useDragControls } from "framer-motion";
import NewCoursePage from "../components/Courses/NewCoursePage";
import { Link } from "react-router-dom";
import FAQ from "../components/Courses/FAQ";

const Locations = () => {
  const { location } = useParams();

  const [expandedHour, setExpandedHour] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
 

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const locationMappings = {
    "hsr-layout": "HSR Layout",
    "tc-palya": "TC Palya",
    "itpl": "ITPL",
    "kr-puram": "KR Puram",
  };

  const formattedLocation = locationMappings[location] || location
    .replace(/-/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  
  const seo = getLocationSEO(formattedLocation);
  
  return (
    <div className="bg-green-400 font-[Bricolage Grotesque] bg-logoGreen">
      <SEOHead 
        title={seo.title}
        description={seo.description}
        keywords={seo.keywords}
        ogImage={seo.ogImage}
        canonical={`/driving-school-in/${location}`}
      />
      
      <Navbar
        backgroundColor="#00CE84"
        logo="../svg/Logo_white.svg"
        burgerMenu="../svg/burger_menu_white.svg"
      />
        <section className="py-16 px-4 md:px-8 lg:px-16 bg-logoGreen">
          <div className="max-w-6xl mx-auto p-4 md:p-10">
            
            <BenefitsSplitLayout location={formattedLocation} />
          </div>
        </section>
      
      
      <div className="min-h-screen bg-green-400 font-['glancyr'] px- pb-12 bg-logoGreen">

        <div className="max-w-5xl mb-12 md:mx-auto mx-4 md:mb-24 
         bg-[#D9FF7A] rounded-[2rem] p-4 md:p-8 shadow-sm relative">
          <div className="flex items-center gap-3 mb-2 md:mb-6 mx-3">
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
                              <Link
                                to="/signup"
                                className="inline-flex items-center ms-3 md:w-auto px-6 md:px-8 py-2 mt-8 md:mt-0 mb-6 text-lg md:text-xl shadow-xl font-extrabold text-white font-['Bricolage Grotesque'] 
                                rounded-full border-2 border-white bg-gradient-to-r from-[#00CE84] to-[#00BC78] hover:from-[#00CE84] hover:to-[#00CE84] transition-colors duration-200"
                              >
                                <img src="/course/rocket.svg" alt="rocket" className="w-5 md:w-5 h-5 md:h-5 mr-2" />
                                Sign Up
                              </Link>
                            </div>
                          {/* </div> */}
                        </div>
                      </div>
                    </div>

        {/* Mini Course Tag - Positioned between sections */}
        <div className="relative -mb-10 md:-mb-16 z-10">
          <img 
            src="../course/minicoursetag.svg" 
            alt="Mini Courses" 
            className="mx-auto w-[300px] md:w-[600px]"
          />
        </div>
        
        
        <div className="pt-12 md:pt-24 bg-white ">
          <MiniCourseNew />
        </div>
      </div>
      
      <FAQ />
      <Footer />
    </div>
  );
};

export default Locations;
