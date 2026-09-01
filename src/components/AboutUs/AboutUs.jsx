import React from "react";
import Navbar2 from "../Navbar";
import Footer from "../Footer";
import aboutUsData from "../../data/aboutUs";
import { seoData } from "../../utils/seoData";
import { useSEO } from "../../hooks/useSEO";
import pitCrewTag from "../../assets/images/PitCrew_Tag.svg";
import { Link } from "react-router-dom";

const LinkedInIcon = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const AboutUs = () => {
  const teamMembers = aboutUsData
    .map((item) => (item.title === "Team" ? item.members : []))
    .flat();
  const weAtLane = aboutUsData.find((item) => item.title === "We at LANE");
  const founder = aboutUsData.find((item) => item.title === "Our Founder");
  const seo = { ...seoData["/about-us"], canonical: "/about-us" };
  useSEO(seo);

  return (
    <>
      <Navbar2
        backgroundColor="#d1b3ff"
        logo="/svg/Logo_white.svg"
        burgerMenu={"/svg/burger_menu_white.svg"}
      />
      <div className="min-h-screen bg-[#D1B3FF] font-grotesque font-normal bg-logoPurple ">
        {/* Hero Section - Updated with clouds */}
        <div className="relative h-[35vh] md:h-[70vh] flex items-center justify-center px-4">
          {/* Clouds background */}
          <img
            src="/svg/Clouds.svg"
            alt="clouds background"
            className="absolute inset-0 w-full h-full "
            style={{ zIndex: 0 }}
          />
          {/* Pipe image */}
          <img
            src="/png/about_us_pipe.png"
            alt="background pipe"
            className="absolute h-[71%] object-contain"
            style={{
              top: "50%",
              transform: "translateY(-30%)",
              zIndex: 1,
            }}
          />
          {/* Content */}
          <div className="relative z-10 max-w-3xl px-8 md:px-12">
            <div className="space-y-6 flex flex-col items-center">
              <div
                className="bg-[#00ce84] text-white text-4xl md:text-6xl font-bold py-2 md:py-3 px-4 md:px-8 inline-block shadow-lg w-fit"
                style={{
                  transform: "rotate(-2deg)",
                  clipPath:
                    "polygon(10% 0, 100% 0, 100% 100%, 10% 100%, 0 50%)",
                  filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.25))",
                }}
              >
                EMPOWERING
              </div>
              <div
                className="bg-[#00ce84] text-white text-2xl md:text-6xl font-bold py-2 md:py-3 px-4 md:px-8 inline-block shadow-lg w-fit"
                style={{
                  transform: "rotate(1deg)",
                  clipPath: "polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%)",
                  filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.25))",
                }}
              >
                the Next Generation
              </div>
              <div
                className="bg-[#00ce84] text-white text-4xl md:text-6xl font-bold py-2 md:py-3 px-4 md:px-8 inline-block shadow-lg w-fit"
                style={{
                  transform: "rotate(-1deg)",
                  filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.25))",
                }}
              >
                of drivers{" "}
                <img
                  src="/svg/rocket.png"
                  alt="rocket"
                  className="inline w-8 md:w-12 h-8 md:h-12"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="w-full font-grotesque ">
          <div className="bg-white rounded-t-3xl pt-8 shadow-lg w-full">
            {/* LANE Introduction */}
            <div className="mt-4 w-full md:w-1/2 px-6 md:px-0 m-auto flex flex-col items-center justify-around mb-12">
              <div className="flex justify-start items-center gap-3 mb-4 w-full">
                <div>
                  <img
                    src="/svg/steering-wheel-icon.svg"
                    alt="steering wheel"
                    className="w-10 md:w-14 h-auto"
                  />
                </div>
                <h2 className="text-3xl md:text-6xl font-medium text-start flex justify-start items-center w-full font-grotesque">
                  We at LANE
                </h2>
              </div>
              <p className="text-md md:text-xl mb-4">{weAtLane.description1}</p>
              <p className="text-md md:text-xl">{weAtLane.description2}</p>

              <a
                href="/signup"
                className="inline-flex items-center justify-center ms-3 md:w-auto px-6 md:px-8 py-2 text-lg md:text-xl mt-12 shadow-xl font-extrabold text-white font-['Bricolage Grotesque'] 
                  rounded-full border-2 border-white bg-gradient-to-r from-[#00CE84] to-[#00BC78] hover:from-[#00CE84] hover:to-[#00CE84] transition-colors duration-200"
              >
                <img
                  src="/course/rocket.svg"
                  alt="rocket"
                  className="w-5 md:w-5 h-5 md:h-5 mr-2"
                />
                Sign Up
              </a>
            </div>

            {/* Founder Section and Team Section temporarily hidden - only the intro paragraph is shown */}
            {false && (
            <div className="bg-[#D1B3FF] rounded-t-3xl p-4 md:p-8 md:pt-20 w-full bg-logoPurple">
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="flex flex-col md:flex-row-reverse justify-around items-start mb-12 w-full md:gap-12 md:w-[80%]">
                  {/* Founder image */}
                  <div className="rounded-2xl overflow-hidden shadow-md w-full md:w-[40%] mb-6 md:mt-10 md:mb-0">
                    <div className="bg-[#B28FFF] p-3 rounded-2xl">
                      <div className="aspect-w-1 aspect-h-1 w-full rounded-xl overflow-hidden">
                        <img
                          src={founder.image}
                          alt="Founder"
                          className="w-full h-full object-cover"
                          style={{ objectPosition: "center 20%" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="w-full px-4 md:px-0 md:w-[70%] lg:w-[60%]">
                    <h2 className="text-4xl sm:text-5xl md:text-7xl lg:text-[6.5rem] font-medium  md:mt-6 w-full leading-tight tracking-tight">
                      Meet Samiksha!
                    </h2>
                    <h3 className="text-xl mb-4 font-semibold">The FOUNDER</h3>
                    <p className="text-lg md:text-xl ">
                      {founder.description1}
                    </p>{" "}
                    <br />
                    <p className="text-lg md:text-xl ">
                      {founder.description2}
                    </p>
                  </div>
                </div>
                {/* Team Section */}

                <div className="bg-white rounded-3xl p-4 md:p-16 mb-12 w-full md:w-[80%]">
                  <h2 className="text-3xl md:text-7xl mb-8 m-auto w-full text-start">
                    And now, the{" "}
                    <span className="font-bold relative inline-block">
                      <img
                        src={pitCrewTag}
                        alt="crew"
                        className="absolute inset-0 w-full h-full z-10"
                        // style={{ left: '-10%' }}
                      />
                      <span className="relative z-20">Pit Crew</span>
                    </span>{" "}
                    that is making it all possible! 👋🚗
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8">
                    {teamMembers.map((member, index) => (
                      <div key={index} className="rounded-2xl overflow-hidden ">
                        <div className="bg-[#D1B3FF] p-3 rounded-2xl">
                          <div className="aspect-w-1 aspect-h-1 w-full rounded-xl overflow-hidden">
                            {/* <img
                              src={member.image}
                              alt={member.name}
                              className="w-full h-full object-cover"
                            /> */}
                            <img
                              src={member.image}
                              alt={member.name}
                              className="object-cover"
                              style={{
                                objectPosition:
                                  member.imagePosition || "50% 20%",
                                width: `${member.imageScale || 100}%`,
                                height: `${member.imageScale || 100}%`,
                                maxWidth: "unset",
                              }}
                            />
                          </div>
                        </div>
                        {/* Name + role on the left, LinkedIn icon on the right.
                            Using justify-between keeps the layout balanced
                            even if a role wraps to two lines. */}
                        <div className="p-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold text-lg mb-1">
                              {member.name}
                            </h3>
                            <p className="text-sm leading-snug">
                              {member.role}
                            </p>
                          </div>
                          {member.linkedin && (
                            <a
                              href={member.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${member.name}'s LinkedIn profile`}
                              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#a185cc] text-white shadow-sm hover:bg-[#0A66C2] hover:text-white transition-colors duration-200 mt-1"
                            >
                              <LinkedInIcon className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* PS Message as 6th card */}
                    <div
                      className="md:rounded-[24px] rounded-3xl p-4 md:p-6 h-[58%] md:h-auto w-full "
                      style={{
                        background: "#D1B3FF",
                        position: "relative",
                        aspectRatio: "1/1",
                      }}
                    >
                      <div className="flex flex-col gap-2">
                        <p className="text-[#1A1A1A] text-[15px] leading-[1.4] text-left">
                          <span className="font-bold">P.S.</span> Big thanks to
                          Shashank and Shubham
                          {/* <br /> */}
                          the awesome friends of Lane who keep everything
                          &thinsp;
                          {/* <br /> */}
                          running smoothly! 🙌💥
                        </p>
                        <p className="text-[#1A1A1A] text-[15px] text-left">
                          We couldn't do it without you!
                        </p>
                      </div>
                      {/* Chat bubble tail */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "-20px",
                          right: "24px",
                          width: "20px",
                          height: "20px",
                          background: "#D1B3FF",
                          clipPath: "polygon(0 0, 100% 0, 100% 100%)",
                          transform: "rotate(0deg)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-center mb-16 -mt-20 md:mt-0">
                    <Link
                      to="https://docs.google.com/forms/d/e/1FAIpQLScN0q7Kt8f2-xdgUKUNtSrd4I4L30iVxDeiQB9vhMG0N4qSpw/viewform"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center ms-3 w-fit
                      md:w-auto  px-8 
                       md:py-2  text-lg md:text-xl shadow-xl font-extrabold text-white font-['Bricolage Grotesque']
                     rounded-full md:border-4 border-2 border-white bg-gradient-to-r from-[#00CE84] to-[#00BC78] hover:from-[#00CE84] hover:to-[#00CE84] transition-colors duration-200"
                    >
                      <img
                        src="/svg/puzzle_white.svg"
                        alt="puzzle icon"
                        className="w-8 md:w-12 h-8  mb-1 "
                      />
                      <p className="text-base md:text-2xl font-bolder ">
                        Join Us
                      </p>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default AboutUs;
