/* eslint-disable no-unused-vars */
import {
  Box,
  Button,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
  Modal,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { motion, useAnimation, useScroll } from "framer-motion";
import { Headset } from "lucide-react";
import RoadSVG from "../components/SVGs/RoadSVG";
import RoadSvg_Sm from "../components/SVGs/RoadSvg_Mobile";
import { Link } from "react-router-dom";
import Testimonial from "../components/Testimonial";
import Rocket from "../components/SVGs/Rocket";
import CountUp from "../components/CountUp";
import LetsChatModal from "../components/LetsChatModal";
import heroStripReviews from "../data/heroStripReviews";
import { Helmet } from "react-helmet-async";
import { captureUTMsOnLoad } from "../utils/utmTracking";

const STRIP_PHOTOS = [
  "/team-photo.jpg",
  "/strip/1.jpeg",
  "/strip/2.jpeg",
  "/strip/3.jpeg",
  "/strip/4.jpeg",
];

const StripScrollContainer = styled.div`
  overflow: hidden;
  position: relative;
  width: 100%;
`;

const StripRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 1.25rem;
  width: max-content;
  animation: stripScroll 50s linear infinite;

  &:hover {
    animation-play-state: paused;
  }

  @keyframes stripScroll {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  @media (max-width: 600px) {
    gap: 0.75rem;
    animation-duration: 32s;
  }
`;

const stats = [
  { value: 4000, label: "Confident Learners" },
  { value: 37000, label: "Hours on road" },
  { value: 60, label: "Vetted Instructors" },
  { value: null, staticLabel: "4.6 ★", label: "star rated" },
];

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
  const [queryParams, setQueryParams] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [stripReviewModalOpen, setStripReviewModalOpen] = useState(false);
  const [activeStripReview, setActiveStripReview] = useState(null);

  const openStripReview = (review) => {
    setActiveStripReview(review);
    setStripReviewModalOpen(true);
  };

  const closeStripReview = () => {
    setStripReviewModalOpen(false);
    setActiveStripReview(null);
  };

  // photo, review, photo, review... cycling the 5 photos across all 10 reviews.
  const stripItems = useMemo(() => {
    const items = [];
    heroStripReviews.forEach((review, index) => {
      items.push({ type: "photo", src: STRIP_PHOTOS[index % STRIP_PHOTOS.length] });
      items.push({ type: "review", ...review });
    });
    return items;
  }, []);

  useEffect(() => {
    // Handle scroll animations
    const unsubscribe = scrollYProgress.onChange((v) => {
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

    // Capture URL parameters
    captureUTMsOnLoad();

    // Capture URL parameters for query string
    const params = new URLSearchParams(window.location.search);
    const result = {};

    for (const [key, value] of params.entries()) {
      result[key] = value;
    }

    // Build query string
    const queryString = new URLSearchParams(result).toString();
    // Save into state
    setQueryParams(queryString);

    return () => unsubscribe();
  }, [scrollYProgress, controls, controlsChanges, location.search]);

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
        <meta
          property="og:title"
          content="InLane - Modern Driving School in Bangalore"
        />
        <meta
          property="og:description"
          content="Start your journey to becoming a confident driver with InLane. Professional driving lessons, structured courses, and comprehensive road safety education in Bangalore."
        />
        <meta property="og:url" content="https://inlane.in" />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* ============ FUNDING BANNER ============ */}
      <div className="w-full bg-[#D1B3FF] py-2.5 px-4 text-center">
        <p className="font-['Bricolage_Grotesque'] font-medium text-[#3C4856] text-[13px] sm:text-[16px] md:text-[18px]">
          We Have <span className="font-bold">Raised Funding</span> To Fix How
          India Learns Driving
        </p>
      </div>

      {/* ============ HERO ============ */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 md:pt-16 text-center">
        <h1 className="font-['Bricolage_Grotesque'] font-bold text-[#3C4856] leading-tight text-[28px] sm:text-[42px] md:text-[52px] lg:text-[56px]">
          Bengaluru, Come Learn to
        </h1>
        <div className="flex items-center justify-center gap-2 sm:gap-4 md:gap-5 mt-1 sm:mt-2">
          <img
            src="/svg/turn_arrow.svg"
            alt=""
            className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 shrink-0"
          />
          <h1 className="font-['Bricolage_Grotesque'] font-extrabold text-[#00CE84] leading-tight text-[32px] sm:text-[48px] md:text-[60px] lg:text-[64px] whitespace-nowrap">
            Actually Drive !
          </h1>
          <img
            src="/svg/P.svg"
            alt=""
            className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 shrink-0"
          />
        </div>

        <p className="mt-5 sm:mt-6 font-['Bricolage_Grotesque'] text-[#3C4856] text-[14px] sm:text-[17px] md:text-[19px] max-w-xl mx-auto">
          A structured, 10-day method from Bengaluru's most-trusted driving
          platform.
        </p>

        {/* ---------- CTA BUTTONS ---------- */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/courses"
            className="group relative flex items-center justify-center gap-2
                       overflow-hidden rounded-full
                       border-[3px] border-white
                       bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                       shadow-[0_10px_28px_rgba(0,0,0,0.14)]
                       transition-all duration-300 hover:scale-[1.02]
                       h-[48px] w-full max-w-[240px] px-6
                       sm:h-[52px] sm:w-auto"
          >
            <Rocket color={{ color: "#FFFFFF", width: 18, height: 18 }} />
            <span className="font-['Bricolage_Grotesque'] font-bold text-white text-[15px] sm:text-[16px]">
              Explore Courses
            </span>
          </Link>
          <Link
            to="/signup"
            className="flex items-center justify-center gap-2 rounded-full
                       bg-white shadow-[0_10px_28px_rgba(0,0,0,0.1)]
                       transition-all duration-300 hover:scale-[1.02]
                       h-[48px] w-full max-w-[240px] px-6
                       sm:h-[52px] sm:w-auto"
          >
            <Headset className="w-5 h-5 text-black" strokeWidth={2.2} />
            <span className="font-['Bricolage_Grotesque'] font-bold text-black text-[15px] sm:text-[16px]">
              Talk to an expert
            </span>
          </Link>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        {/* decorative arc behind stat cards, blending into the "Backed By" panel — full-bleed, no side gaps */}
        <img
          src="/Union.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-x-0 z-0 top-[60px] sm:top-[80px] md:top-[100px]
                     w-full h-[260px] sm:h-[340px] md:h-[420px] object-fill
                     pointer-events-none select-none"
        />

        <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* ---------- STAT CARDS ---------- */}
        <div className="relative z-10 mt-16 sm:mt-20 md:mt-24 grid grid-cols-2 sm:flex sm:flex-row flex-wrap justify-center gap-4 sm:gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center justify-center rounded-[14px]
                          bg-[#D9FF7A] px-4 py-4 sm:px-6 sm:py-5
                          shadow-[0_6px_16px_rgba(0,0,0,0.12)]
                          ${index % 2 === 0 ? "rotate-[-3deg]" : "rotate-[3deg]"}`}
            >
              <span className="font-['Bricolage_Grotesque'] font-extrabold text-black text-[22px] sm:text-[28px] md:text-[32px] whitespace-nowrap">
                {stat.value !== null ? (
                  <CountUp target={stat.value} suffix="+" />
                ) : (
                  stat.staticLabel
                )}
              </span>
              <span className="font-['Bricolage_Grotesque'] font-medium text-black text-[12px] sm:text-[14px] mt-1 whitespace-nowrap">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* ---------- BACKED BY ---------- */}
        <div className="relative z-10 mt-14 sm:mt-20 md:mt-24 pb-14 sm:pb-20">
          <p className="font-['Bricolage_Grotesque'] font-bold text-[#3C4856] text-[15px] sm:text-[18px] tracking-[0.08em] mb-6">
            BACKED BY
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 md:gap-16 translate-x-6">
            <img
              src="/investors/dvc.svg"
              alt="DVC"
              className="h-6 sm:h-8 md:h-9 w-auto"
            />
            <img
              src="/investors/kae-capital.svg"
              alt="Kae Capital"
              className="h-9 sm:h-11 md:h-14 w-auto self-center object-contain -mt-1"
            />
            <img
              src="/investors/antler.svg"
              alt="Antler"
              className="h-5 sm:h-7 md:h-8 w-auto"
            />
          </div>
        </div>
        </div>
      </div>

      {/* ============ FEATURED REVIEWS TEASER (horizontal scroll strip) ============ */}
      <div className="w-full pb-14 sm:pb-20">
        <StripScrollContainer>
          <StripRow>
            {[...stripItems, ...stripItems].map((item, i) =>
              item.type === "photo" ? (
                <div
                  key={`photo-${i}`}
                  className="w-[220px] sm:w-[300px] md:w-[340px] h-[220px] sm:h-[260px] rounded-[24px] overflow-hidden border-[3px] border-black flex-none"
                >
                  <img
                    src={item.src}
                    alt="The Lane team"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  key={`review-${item.name}-${i}`}
                  onClick={() => openStripReview(item)}
                  className="w-[260px] sm:w-[340px] md:w-[380px] h-[220px] sm:h-[260px] rounded-[24px] bg-[#D1B3FF] p-5 sm:p-6 flex-none cursor-pointer overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <h3 className="font-['Bricolage_Grotesque'] font-bold text-black text-[15px] sm:text-[17px]">
                        {item.name}
                      </h3>
                      {item.instructor && (
                        <p className="font-['Bricolage_Grotesque'] text-black/60 text-[11px] sm:text-[12px]">
                          Instructor: {item.instructor}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-[13px] sm:text-[15px] text-[#FFB800]"
                      style={{ WebkitTextStroke: "1px black" }}
                    >
                      {"★".repeat(item.rating)}
                    </span>
                  </div>
                  <p className="font-['Bricolage_Grotesque'] text-black text-[13px] sm:text-[15px] leading-relaxed line-clamp-5">
                    {item.comment}
                  </p>
                </div>
              )
            )}
          </StripRow>
        </StripScrollContainer>
      </div>

      <Modal
        open={stripReviewModalOpen}
        onClose={closeStripReview}
        aria-labelledby="strip-review-modal-title"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: "600px",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 4,
            borderRadius: "16px",
          }}
        >
          <IconButton
            aria-label="close"
            onClick={closeStripReview}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
          {activeStripReview && (
            <Box>
              <Typography
                id="strip-review-modal-title"
                variant="h5"
                fontWeight="bold"
                fontFamily="Bricolage Grotesque"
                color="#000000"
                sx={{ mb: activeStripReview.instructor ? 0.5 : 2 }}
              >
                {activeStripReview.name}
              </Typography>
              {activeStripReview.instructor && (
                <Typography
                  variant="body2"
                  fontFamily="Bricolage Grotesque"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Instructor: {activeStripReview.instructor}
                </Typography>
              )}
              <div className="flex gap-0.5 mb-2">
                {[...Array(activeStripReview.rating)].map((_, i) => (
                  <span key={i} className="text-[20px] text-[#FFB800]">
                    ★
                  </span>
                ))}
              </div>
              <Typography
                variant="body1"
                fontFamily="Bricolage Grotesque"
                color="#000000"
              >
                {activeStripReview.comment}
              </Typography>
            </Box>
          )}
        </Box>
      </Modal>

      <LetsChatModal open={chatOpen} onClose={() => setChatOpen(false)} />

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
            <div>
              By continuing, you agree to our
              <nav className="flex flex-row justify-center gap-4">
                <a
                  target="_blank"
                  href="https://inlane.in/terms-and-conditions"
                  className="text-muted-foreground text-gray-500 underline"
                  rel="noreferrer"
                >
                  Terms of Service
                </a>
                <a
                  target="_blank"
                  href="https://inlane.in/privacy-policy"
                  className="text-muted-foreground text-gray-500 underline"
                  rel="noreferrer"
                >
                  Privacy Policies
                </a>
              </nav>
            </div>
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
                  background:
                    "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
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
