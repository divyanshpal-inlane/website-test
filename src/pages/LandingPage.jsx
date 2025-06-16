/* eslint-disable no-unused-vars */
import {
  Box,
  Button,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { motion, useAnimation, useScroll } from "framer-motion";
import RoadSVG from "../components/SVGs/RoadSVG";
import RoadSvg_Sm from "../components/SVGs/RoadSvg_Mobile";
import { Link } from "react-router-dom";
import Testimonial from "../components/Testimonial";
import Rocket from "../components/SVGs/Rocket";
import { Helmet } from 'react-helmet-async';

const LandingPage = () => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const isMediumScreen = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const smallIconStyle = { color: "#FFFFFF", width: 16, height: 16 };
  const mediumIconStyle = { color: "#FFFFFF", width: 34, height: 34 };
  const largeIconStyle = { color: "#FFFFFF", width: 40, height: 40 };
  const IconStyle = isSmallScreen
    ? smallIconStyle
    : isMediumScreen
    ? mediumIconStyle
    : largeIconStyle;
  const { scrollYProgress } = useScroll();
  const [scrollPosition, setScrollPosition] = useState(0);
  const controls = useAnimation();
  const controlsChanges = useAnimation();

  useEffect(() => {
    scrollYProgress.onChange((v) => {
      setScrollPosition(v);
      controls.start({
        opacity: 1,
        transition: { duration: 10 },
      });
      controlsChanges.start({
        opacity: 0,
        transition: { duration: 5 },
      });
    });
  }, [scrollYProgress, controls]);

  return (
    <>
      <Helmet>
        <title>Learn Driving in Just 10 Days | Lane Driving School</title>
        <meta 
          name="description" 
          content="Drive confidently with Lane's proven curriculum and expert instructors. Flexible schedules, personalized attention, and excellent results await"
        />
        <meta 
          name="keywords" 
          content="driving school bangalore, car driving classes, learn driving bangalore, best driving school, driving lessons near me, driving instructor bangalore, automatic car training, driving school registration"
        />
        {/* Essential meta tags */}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://inlane.in" />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="InLane - Modern Driving School in Bangalore" />
        <meta property="og:description" content="Start your journey to becoming a confident driver with InLane. Professional driving lessons, structured courses, and comprehensive road safety education in Bangalore." />
        <meta property="og:url" content="https://inlane.in" />
        <meta property="og:type" content="website" />
      </Helmet>

      <Box>
        <Box className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 ">
          <div className="text-center relative ">
            <h1 className="relative text-4xl sm:text-5xl md:text-6xl font-bold text-[#3C4856] font-['Bricolage_Grotesque'] mb-8">
              {/* Turn arrow in top left */}
              <div className="absolute top-4 left-4 md:top-[-1rem] md:left-[19rem]">
                <img
                  src="/svg/turn_arrow.svg"
                  alt="Turn arrow"
                  className="w-8 h-8 md:w-2/3 md:h-2/3"
                />
              </div>
              {/* P icon in top right */}
              <div className="absolute top-4 right-4 md:top-[1rem] md:right-[17rem]">
                <img
                  src="/svg/P.svg"
                  alt="P icon"
                  className="w-8 h-8 md:w-2/3 md:h-2/3"
                />
              </div>
              Let's Start Your
              <br />
              Driving Journey!
            </h1>

            <div className="flex flex-row items-center justify-center gap-6 mt-18">
              <Button
                variant="contained"
                component={Link}
                to="/signup"
                startIcon={<Rocket color={IconStyle} />}
                sx={{
                  background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  color: "white",
                  fontWeight: "bold",
                  fontFamily: "Bricolage Grotesque",
                  textDecoration: "none",
                  textTransform: "none",
                  "&:hover": {
                    background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  },
                  border: "2.5px solid #FFFFFF",
                  borderRadius: "50px",
                  padding: {
                    sm: "10px 20px",
                    md: "6px 68px",
                  },
                  fontSize: { xs: "0.8rem", sm: "1rem", md: "24px" },
                  whiteSpace: "nowrap",
                  boxShadow: "2px 4px 4px rgba(0, 0, 0, 0.35)",
                }}
              >
                Sign Up
              </Button>
              <img
                src="/svg/down_arrow.svg"
                alt="down arrow"
                className="w-8 h-8 md:w-auto md:h-auto"
              />
            </div>
          </div>
        </Box>
      </Box>
    
      {/* second section of the hero page  */}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
         
        }}
      >
        <Box
          sx={{
           
            width: { xs: "100%", sm: "90%", md: "85%" },
           
            maxWidth: "1700px",
            
          }}
        >
          {!isSmallScreen ? <RoadSVG /> : <RoadSvg_Sm />}
        </Box>
        {/* The end up part of the road where a flag is shown with a tag ready to drive Confidently */}
        <Box
          sx={{
            maxHeight: "100vh",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: { xs: "20px", sm: "30px", md: "40px" },
          }}
        >
          <Box
            sx={{
              borderRadius: "30px",
              padding: { xs: "20px", sm: "30px", md: "40px" },
              height: "auto",
              width: { xs: "100%", sm: "90%", md: "80%", lg: "100%" },
              maxWidth: 1378,
              justifyContent: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <Box
              component="img"
              src="/Flag.svg"
              alt="flag"
              sx={{
                width: { xs: "25%", sm: "30%", md: "40%", lg: "auto" },
                // maxWidth: 200,
                // height: "auto",
                marginBottom: { xs: "20px", sm: "30px", md: "40px" },
                // bgcolor: "red",
              }}
            />
            <Typography
              variant="h3"
              fontWeight="bold"
              // fontSize={{ xs: "24px", sm: "30px", md: "48px", lg: "61px" }}
              className=""
              fontFamily="Bricolage Grotesque"
              color="#000000"
              marginBottom={{ xs: "18px", sm: "30px", md: "40px" }}
            >
              Ready To Drive Confidently?
            </Typography>
            <Typography
              variant="h5"
              fontSize={{ xs: "16px", sm: "22px", md: "36px", lg: "48px" }}
              fontFamily="Bricolage Grotesque"
              color="#000000"
              // marginBottom={{ xs: "0px", sm: "20px", md: "30px" }}
            >
              Help us create a world with
            </Typography>
            <Box
              component="img"
              src="/svg/zero.svg"
              alt="Zero Road Fatalities"
              sx={{
                width: { xs: "80%", sm: "70%", md: "90%", lg: "90%" },
                maxWidth: 774.83,
                height: "auto",
                marginBottom: { xs: "6px", sm: "30px", md: "40px" },
                padding: { xs: "10px", sm: "11px", md: "20px" },
              }}
            />
              <Button
                variant="contained"
                component={Link}
                target="_blank"
                to="/signup"
                size="large"
                startIcon={<Rocket color={IconStyle} />}
                sx={{
                  background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  color: "white",
                  "&:hover": {
                    background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  },
                  border: "3px solid #FFFFFF",
                  borderRadius: "50px",
                  boxShadow: "2px 4px 4px rgba(0, 0, 0, 0.35)",
                  padding: { xs: "12px 24px", sm: "14px 32px", md: "16px 44px" },
                  width: { xs: "60%", sm: "70%", md: "60%", lg: 324.38 },
                  maxWidth: 324.38,
                  height: { xs: 38, sm: 60, md: 69.47 },
                  fontFamily: "Bricolage Grotesque",
                  fontSize: { xs: "16px", sm: "24px", md: "30px", lg: "36px" },
                  fontWeight: "bold",
                  textTransform: "none",
                  marginTop: { xs: "12px", sm: "30px", md: "40px" },
                }}
              >
                
                Sign Up
              </Button>
          </Box>
        </Box>
      </Box>
      <Testimonial />
    </>
  );
};

export default LandingPage;