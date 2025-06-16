import React, { useState, useMemo, useCallback } from 'react';
import { Card } from '@mui/material';
import Button from '@mui/material/Button';
import Rocket from './SVGs/Rocket';
import { useMediaQuery, useTheme } from '@mui/material';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Location to practice routes mapping
const locationRoutes = {
  "HSR LAYOUT": "BDA complex and 27th Main Road",
  "KR PURAM": "Old Madras Road (NH75), Devasandra Main Road, Hoodi Main Road",
  "MAHADEVAPURA": "Whitefield Main Road, Graphite India Road, ITPL Main Road",
  "WHITEFIELD": "Varthur Road, Channasandra Main Road, ECC Road",
  "MARATHAHALLI": "Outer Ring Road (ORR), Varthur Main Road, Old Airport Road",
  "KUDLU GATE": "Hosur Road (NH44), Kudlu Main Road, Begur Road",
  "KUDLU": "Haralur Road, Singasandra Main Road, Hosa Road",
  "BEGUR": "Begur Main Road, Begur-Koppa Road, Hulimavu-Begur Road",
  "INDIRANAGAR": "100 Feet Road, CMH Road, Indiranagar 1st Stage Main Road",
  "BENNIGANHALLI": "Old Madras Road (NH75), Benniganhalli(tin factory) Main Road, Pai Layout Main Road",
  "BAIYAPPANAHALLI": "Swami Vivekananda Road, Baiyappanahalli Road, NGEF Main Road",
  "SWAMI VIVEKANANDA ROAD": "Old Madras Road (NH75), Swami Vivekananda Road, Cambridge Road",
  "TC PALYA": "TC Palya Main Road, Ramamurthy Nagar Main Road, Anandapura Main Road",
  "HORAMAVU": "Horamavu Main Road, Outer Ring Road (ORR), Horamavu-Agara Road",
  "RAMAMURTHY NAGAR": "Ramamurthy Nagar Main Road, Outer Ring Road (ORR), TC Palya Main Road",
  "KASTURI NAGAR": "Kasturi Nagar Main Road, Outer Ring Road (ORR) – Kasturi Nagar Stretch, NGEF Layout Roads",
  "HOODI": "Hoodi Main Road, Whitefield-Hoodi Road, Graphite India Road",
  "ITPL": "ITPL Main Road, Vydehi Hospital Road, Brookefield Road",
  "AVALAHALLI": "Avalahalli Main Road, Old Madras Road (NH75) – Avalahalli Stretch, Medahalli-Avalahalli Road"
};

// Memoized card variants for better performance
const cardVariants = {
  card: (custom) => ({
    scale: 1.0 - 0.03 * custom.diff,
    x: custom.diff === custom.cardsLength - 1 ? custom.swipeKeyframes : 40 * custom.diff,
    rotate: custom.diff === custom.cardsLength - 1 ? 0 : 3 * custom.diff,
  }),
  swipe: (custom) => ({
    scale: 1.0 - 0.03 * custom.diff,
    x: [custom.swipeKeyframes, 40 * custom.diff],
    rotate: [8, 0],
  })
};

const BenefitsSplitLayout = ({ location = "HSR Layout" }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeKeyframes, setSwipeKeyframes] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));

  // Memoize practice routes to prevent recalculation
  const practiceRoutes = useMemo(() => 
    locationRoutes[location.toUpperCase()] || "No practice routes available for this location.",
    [location]
  );

  // Memoize benefits array
  const benefits = useMemo(() => [
    {
      id: 1,
      title: "Tailored driving lessons",
      description: "Tailored driving lessons for beginners & advanced learners",
      color: "bg-[#FFC229]",
      image: "/benefits3.png"
    },
    {
      id: 2,
      title: "Local expertise",
      description: `Local experts who understand ${location}'s traffic patterns & shortcuts`,
      color: "bg-[#FF99F5]",
      image: "/webp/benefits2.webp"
    },
    {
      id: 3,
      title: "Practice routes",
      description: `Practice routes around ${practiceRoutes} and others`,
      color: "bg-[#6BECFF]",
      image: "/webp/benefits1.webp"
    }
  ], [location, practiceRoutes]);

  const cardsLength = benefits.length;

  // Memoize modulo function
  const modulo = useCallback((m, n) => ((m % n) + n) % n, []);

  // Memoize drag end handler
  const dragEnd = useCallback((event, info) => {
    const swipeThreshold = isMobile ? 60 : 120;
    const velocityThreshold = isMobile ? 40 : 80;

    if ((Math.abs(info.velocity.x) > velocityThreshold) && (Math.abs(info.offset.x) > swipeThreshold)) {
      setCurrentIndex(prev => (prev + 1) % cardsLength);
      setSwipeKeyframes(info.offset.x);
    }
  }, [isMobile, cardsLength]);

  // Memoize card click handler
  const handleCardClick = useCallback((index) => {
    if (isMobile && index === currentIndex) {
      setCurrentIndex(prev => (prev + 1) % cardsLength);
    }
  }, [isMobile, currentIndex, cardsLength]);

  // Memoize button styles with proper responsive design
  const buttonStyles = useMemo(() => ({
    background: "linear-gradient(90deg, #D9FF7A 0%, #C1EC55 100%)",
    color: "#000000",
    "&:hover": {
      background: "linear-gradient(90deg, #D9FF7A 0%, #C1EC55 100%)",
      transform: "translateY(-2px)",
    },
    border: "3px solid #FFFFFF",
    borderRadius: "50px",
    padding: { 
      xs: "12px 24px", 
      sm: "14px 28px", 
      md: "16px 32px", 
      lg: "18px 36px"
    },
    minWidth: { xs: "180px", sm: "200px", md: "220px" },
    height: { 
      xs: "48px", 
      sm: "52px", 
      md: "56px", 
      lg: "60px"
    },
    fontFamily: "Bricolage Grotesque",
    fontSize: { 
      xs: "16px", 
      sm: "18px", 
      md: "20px", 
      lg: "22px"
    },
    fontWeight: "bold",
    textTransform: "none",
    boxShadow: "6px 8px 4px rgba(0, 0, 0, 0.35)",
    transition: "all 0.3s ease",
  }), []);

  // Get responsive dimensions
  const getCardDimensions = useMemo(() => {
    if (isMobile) {
      return { width: 280, height: 320 };
    } else if (isTablet) {
      return { width: 320, height: 380 };
    } else {
      return { width: 380, height: 450 };
    }
  }, [isMobile, isTablet]);

  // Optimized Card Component
  const OptimizedCard = React.memo(({ benefit, index }) => {
    const diff = modulo(index - currentIndex, cardsLength);
    const isTopCard = diff === cardsLength - 1;
    const isCurrentCard = currentIndex === index;

    // Memoize animation custom values
    const animationCustom = useMemo(() => ({
      diff,
      cardsLength,
      swipeKeyframes: isTopCard ? swipeKeyframes : 0
    }), [diff, cardsLength, isTopCard, swipeKeyframes]);

    // Memoize card styles
    const cardStyles = useMemo(() => ({
      zIndex: isTopCard ? 10 * cardsLength : 10 * (cardsLength - diff),
      willChange: 'transform',
      cursor: isCurrentCard ? 'grabbing' : 'grab',
      boxShadow: isCurrentCard 
        ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' 
        : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      width: '100%',
      height: '100%',
    }), [isTopCard, cardsLength, diff, isCurrentCard]);

    // Memoize image classes with proper responsive sizing
    const imageClasses = useMemo(() => {
      const baseClasses = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 object-contain";
      
      if (isMobile) {
        const sizeMap = {
          0: 'h-24 w-24',
          1: 'h-20 w-20',
          default: 'h-16 w-16'
        };
        return `${baseClasses} ${sizeMap[index] || sizeMap.default}`;
      } else if (isTablet) {
        const sizeMap = {
          0: 'h-32 w-32',
          1: 'h-28 w-28',
          default: 'h-24 w-24'
        };
        return `${baseClasses} ${sizeMap[index] || sizeMap.default}`;
      } else {
        const sizeMap = {
          0: 'h-40 w-40',
          1: 'h-36 w-36',
          default: 'h-32 w-32'
        };
        return `${baseClasses} ${sizeMap[index] || sizeMap.default}`;
      }
    }, [index, isMobile, isTablet]);

    return (
      <motion.article
        className={`absolute inset-0 ${benefit.color} shadow-lg rounded-2xl border-2 border-white overflow-hidden`}
        initial={false}
        variants={cardVariants}
        animate={isTopCard ? "swipe" : "card"}
        custom={animationCustom}
        style={cardStyles}
        transition={{
          duration: 0.6,
          rotate: { duration: 0.8 },
          type: "tween",
          ease: "easeOut"
        }}
        drag={isCurrentCard ? "x" : false}
        dragSnapToOrigin
        whileDrag={{
          rotate: "8deg",
          scale: 1.05,
          transition: { duration: 0.1 },
        }}
        whileHover={isCurrentCard ? { scale: 1.02 } : {}}
        whileTap={isCurrentCard ? { scale: 0.98 } : {}}
        onDragEnd={dragEnd}
        onClick={() => handleCardClick(index)}
      >
        <div className="h-full p-4 sm:p-5 md:p-6 flex flex-col justify-between">
          <div className="flex-1 flex items-center justify-center mb-4">
            <div className="relative w-full h-full max-h-32 sm:max-h-40 md:max-h-48">
              <img
                src={benefit.image}
                alt={benefit.title}
                className={imageClasses}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
          <div className="flex-shrink-0">
            <h3 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-center leading-tight px-2">
              {benefit.description}
            </h3>
          </div>
        </div>
      </motion.article>
    );
  });

  return (
    <div className="min-h-screen w-full bg-[#00CE84] px-4 sm:px-6 md:px-8 lg:px-12 py-8 sm:py-12 md:py-16">
      <div className="max-w-7xl mx-auto h-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center min-h-[calc(100vh-8rem)]">
          
          {/* Left side content */}
          <div className="space-y-6 md:space-y-8 lg:space-y-10 flex flex-col justify-center">
            <div className="space-y-4 md:space-y-6">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight text-black">
                Looking for a{' '}
                <span className="block sm:inline">
                  driving school in{' '}
                </span>
                <span className="location-wrapper inline-block">
                  <span className="location-lines">
                    {location}?
                  </span>
                </span>
              </h1>
              
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold leading-relaxed text-black max-w-lg">
                Our expert instructors in {location} are here to help you drive confidently and safely
              </h3>
            </div>

            <div className="flex justify-center lg:justify-start pt-4">
              <Button
                variant="contained"
                component={Link}
                to="/signup"
                startIcon={
                  <Rocket
                    color={{ 
                      color: "#000000", 
                      width: 20, 
                      height: 20
                    }}
                  />
                }
                sx={buttonStyles}
              >
                Start Now!
              </Button>
            </div>
          </div>

          {/* Right side cards */}  
          <div className="flex justify-center lg:justify-end">
            <motion.section 
              className="relative"
              style={{ 
                willChange: 'transform',
                width: getCardDimensions.width,
                height: getCardDimensions.height,
              }}
            >
              {benefits.map((benefit, index) => (
                <OptimizedCard 
                  key={benefit.id} 
                  benefit={benefit} 
                  index={index}
                />
              ))}
            </motion.section>
          </div>
        </div>
      </div>
      
      {/* Enhanced CSS */}
      <style jsx>{`
        .location-wrapper {
          position: relative;
          display: inline-block;
        }
        
        .location-lines {
          background-image: url('/location_tag.svg');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          line-height: 1.2;
          font-weight: bold;
          padding: 8px 16px;
          display: inline-block;
          min-width: fit-content;
        }
        
        @media (max-width: 768px) {
          .location-lines {
            padding: 6px 12px;
            background-size: cover;
          }
        }
        
        @media (min-width: 1024px) {
          .location-lines {
            padding: 10px 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default BenefitsSplitLayout;