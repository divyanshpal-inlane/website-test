import React, { useState } from "react";
import { Button } from "@mui/material";
import miniCourses from "../../data/miniCourse";
import { Link } from "react-router-dom";

const MiniCourseNew = () => {
  // Initialize all courses as collapsed
  const [expandedStates, setExpandedStates] = useState({
    0: false,
    1: false,
    2: false,
    3: false
  });

  const toggleExpand = (index) => {
    setExpandedStates(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };



  return (
    <div className="max-w-6xl mx-auto mb-12 p-4 md:p-12 pt-8 md:pt-16 ">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-3xl mx-auto ">
        {miniCourses.map((course, index) => (
          <div
            key={index}
            className={`${course.bgColor} rounded-[2rem] p-6 md:p-8 relative w-full  shadow-lg drop-shadow-lg`}
          >
            <div className="flex items-center gap-3 mb-6">
              <img src="/course/arrow.svg" alt="arrow" className="w-8 md:w-12" />
              <h2 className="text-2xl md:text-2xl   font-['glancyr']">
                {course.title}
              </h2>
            </div>

            <div className="mb-6">
              <button
                onClick={() => toggleExpand(index)}
                className="flex items-center gap-2 font-bold mb-4 rounded-full border-[1px] border-black/20 px-4 py- text:md md:text-lg"
              >
                <span>What will we ace together?</span>
                <svg
                  className={`w-5 h-5 transition-transform ${expandedStates[index] ? "rotate-180" : ""
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

              <div className={`transition-all duration-300 ${expandedStates[index] ? 'opacity-100 max-h-[500px]' : 'opacity-0 max-h-0'
                } overflow-hidden`}>
                <ul className="space-y- pl-4">
                  {course.points.map((point, idx) => (
                    <li key={idx} className="text-md font-normal list-disc ms-2">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 ">
              <div className="flex items-center">
                <img
                  src="/course/timer.svg"
                  alt="duration"
                  className="w-10 h-10 md:w-12 md:h-12"
                />
                <div className="flex flex-col justify-center">
                  <span className="text-lg font-semibold">Duration:</span>
                  <p className="text-lg font-bold">{course.duration}</p>
                </div>
              </div>
              {/* <div className="flex items-center gap-1">
                <img
                  src="/course/coin.svg"
                  alt="price"
                  className="w-10 h-10 md:w-12 md:h-12"
                />
                <div >
                  <span className="text-lg font-semibold">Price:</span>
                  <p className="text-lg font-bold">{course.price}</p>
                </div>
              </div> */}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-12 mb-12 md:mb-0">
        <Link to="/signup">
          <Button
            variant="contained"
            startIcon={<img src="/course/rocket.svg" alt="rocket" className="w-6 h-6" />}
            sx={{
              background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
              color: "white",
              fontWeight: "bold",
              fontFamily: "Bricolage Grotesque",
              textDecoration: "none",
              textTransform: "none",
              width: "110%",
              border: "3px solid white",
              borderRadius: "50px",
              padding: {
                xs: "4px 24px",
                sm: "10px 20px",
                md: "1px 25px",
              },
              fontSize: {
                xs: "1rem",
                sm: "1.125rem",
                md: "1.5rem",
              },
              "&:hover": {
                backgroundColor: "#00CE84",
              },
            }}
          >
            Sign Up
          </Button>

        </Link>
      </div>
    </div>
  );
};

export default MiniCourseNew;
