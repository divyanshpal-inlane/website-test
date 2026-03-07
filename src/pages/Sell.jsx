import React, { useState, useCallback, memo } from 'react';
import { Helmet } from "react-helmet-async";
import {
  Box,
  TextField,
  Button,
  FormControl,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Navbar2 from "../components/Navbar";
import Footer from "../components/Footer";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

// Car makes data
const carMakes = [
  "Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Honda", "Toyota",
  "Kia", "MG", "Volkswagen", "Skoda", "Renault", "Nissan", "Ford",
  "Jeep", "BMW", "Mercedes-Benz", "Audi", "Other"
];

// Fuel types
const fuelTypes = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];

// Transmission types
const transmissionTypes = ["Manual", "Automatic", "AMT", "CVT", "DCT"];

// Ownership types
const ownershipTypes = ["1st Owner", "2nd Owner", "3rd Owner", "4th+ Owner"];

// Generate years from current year to 2000
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i);

// Feature Card Component
const FeatureCard = memo(({ icon, title, description, bgColor }) => (
  <div className={`${bgColor} rounded-2xl p-4 md:p-6 flex flex-col h-full`}>
    <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl flex items-center justify-center mb-3">
      {icon}
    </div>
    <h3 className="font-['Bricolage_Grotesque'] font-bold text-lg md:text-xl mb-2">{title}</h3>
    <p className="font-['Bricolage_Grotesque'] text-sm text-gray-700 leading-relaxed">{description}</p>
  </div>
));

// Step Card Component
const StepCard = memo(({ number, icon, title, description, bgColor }) => (
  <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-200">
    <div className="flex items-start justify-between mb-3">
      <span className="font-['Bricolage_Grotesque'] font-bold text-3xl md:text-4xl">{number}.</span>
      <div className="w-8 h-8 text-gray-400">
        {icon}
      </div>
    </div>
    <div className={`${bgColor} rounded-xl px-3 py-2 inline-block mb-2`}>
      <h4 className="font-['Bricolage_Grotesque'] font-bold text-sm md:text-base">{title}</h4>
    </div>
    <p className="font-['Bricolage_Grotesque'] text-xs md:text-sm text-gray-600">{description}</p>
  </div>
));

// Seller Testimonial Card
const SellerCard = memo(({ image, title, carName, quote, soldIn, whyLane, isMain }) => (
  <div className={`${isMain ? 'scale-100 z-10' : 'scale-90 opacity-80'} transition-all duration-300`}>
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg">
      {isMain && (
        <div className="bg-[#D9FF7A] text-center py-2 font-['Bricolage_Grotesque'] font-bold text-sm">
          {title}
        </div>
      )}
      {!isMain && (
        <div className="bg-[#FF6B6B] text-white text-center py-2 font-['Bricolage_Grotesque'] font-bold text-sm">
          {title}
        </div>
      )}
      <div className="relative h-32 md:h-40">
        <img src={image} alt={carName} className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <h4 className="font-['Bricolage_Grotesque'] font-bold text-[#00CE84] text-sm mb-2">{carName}</h4>
        <p className="font-['Bricolage_Grotesque'] text-xs text-gray-600 mb-3 line-clamp-3">"{quote}"</p>
        <p className="font-['Bricolage_Grotesque'] text-xs"><strong>Sold in:</strong> {soldIn}</p>
        <p className="font-['Bricolage_Grotesque'] text-xs text-[#00CE84] mt-1"><strong>Why Lane:</strong> {whyLane}</p>
      </div>
    </div>
  </div>
));

// FAQ Item Component
const FAQItem = memo(({ question, isOpen, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left hover:shadow-md transition-all"
  >
    <span className="font-['Bricolage_Grotesque'] text-sm pr-2">{question}</span>
    <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
  </button>
));

const Sell = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [currentTestimonial, setCurrentTestimonial] = useState(1);
  const [openFAQ, setOpenFAQ] = useState(null);

  const [formData, setFormData] = useState({
    registrationNumber: '',
    make: '',
    model: '',
    year: '',
    fuelType: '',
    transmission: '',
    ownership: '',
  });

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission
    console.log('Form submitted:', formData);
    alert('Thank you! We will contact you shortly with your car valuation.');
  };

  const testimonials = [
    {
      title: "Seller profile 2",
      image: "/benefits1.jpg",
      carName: "2019 Honda City (Petrol)",
      quote: "I was worried about paperwork and ownership transfer. Everything was taken care of without me visiting the RTO.",
      soldIn: "4 days",
      whyLane: "End-to-end RTO support",
    },
    {
      title: "Seller profile 1",
      image: "/benefits2.jpg",
      carName: "Car: 2018 Hyundai i20 (Petrol)",
      quote: "Didn't want to deal with calls and bargaining. Lane handled the inspection, shared a clear price, and closed the sale smoothly.",
      soldIn: "6 days",
      whyLane: "Transparent pricing, zero hassle",
    },
    {
      title: "Seller profile 3",
      image: "/benefits3.jpg",
      carName: "2020 Maruti Baleno (Petrol)",
      quote: "The doorstep inspection made it easy. One fair offer, quick payment, and no last-minute deductions.",
      soldIn: "5 days",
      whyLane: "Fast, fair deal",
    },
  ];

  const faqsLeft = [
    "What is Lane marketplace?",
    "How is this different from market place platforms?",
    "How is my car's price decided?",
    "Do you help with RC transfer and documentation?",
    "Can I sell a car with a loan or minor issues?",
    "Why should I trust this platform?",
  ];

  const faqsRight = [
    "Who are the buyers on this platform?",
    "Will I receive multiple calls or face bargaining?",
    "How long does it usually take to sell a car?",
    "Is the payment process safe?",
    "Do you purchase the car yourself?",
  ];

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="bg-white">
      <Helmet>
        <title>Sell Your Car - InLane | Fast, Fair & Hassle Free</title>
        <meta
          name="description"
          content="Sell your car fast, fair and hassle-free with InLane. Get free valuation, doorstep inspection, and best offers from verified buyers."
        />
      </Helmet>

      <Navbar2 backgroundColor='#00CE84' logo='/LANE_LOGO_White.svg' burgerMenu='/svg/burger_menu_white.svg' />

      {/* Hero Section */}
      <section className="bg-[#00CE84] pt-8 pb-16 md:pb-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-8">
            {/* Form */}
            <div className="w-full lg:w-1/2 z-10">
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <TextField
                    fullWidth
                    variant="outlined"
                    name="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                    placeholder="Car Registration Number"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '50px',
                        fontFamily: 'Bricolage Grotesque',
                      }
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormControl fullWidth size="small">
                      <Select
                        name="make"
                        value={formData.make}
                        onChange={handleChange}
                        displayEmpty
                        sx={{
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }}
                      >
                        <MenuItem value="" disabled>Make</MenuItem>
                        {carMakes.map(make => (
                          <MenuItem key={make} value={make}>{make}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      variant="outlined"
                      name="model"
                      value={formData.model}
                      onChange={handleChange}
                      placeholder="Model"
                      size="small"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormControl fullWidth size="small">
                      <Select
                        name="year"
                        value={formData.year}
                        onChange={handleChange}
                        displayEmpty
                        sx={{
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }}
                      >
                        <MenuItem value="" disabled>Year</MenuItem>
                        {years.map(year => (
                          <MenuItem key={year} value={year}>{year}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth size="small">
                      <Select
                        name="fuelType"
                        value={formData.fuelType}
                        onChange={handleChange}
                        displayEmpty
                        sx={{
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }}
                      >
                        <MenuItem value="" disabled>Fuel Type</MenuItem>
                        {fuelTypes.map(fuel => (
                          <MenuItem key={fuel} value={fuel}>{fuel}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormControl fullWidth size="small">
                      <Select
                        name="transmission"
                        value={formData.transmission}
                        onChange={handleChange}
                        displayEmpty
                        sx={{
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }}
                      >
                        <MenuItem value="" disabled>Transmission</MenuItem>
                        {transmissionTypes.map(trans => (
                          <MenuItem key={trans} value={trans}>{trans}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth size="small">
                      <Select
                        name="ownership"
                        value={formData.ownership}
                        onChange={handleChange}
                        displayEmpty
                        sx={{
                          borderRadius: '50px',
                          fontFamily: 'Bricolage Grotesque',
                        }}
                      >
                        <MenuItem value="" disabled>Ownership</MenuItem>
                        {ownershipTypes.map(owner => (
                          <MenuItem key={owner} value={owner}>{owner}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>

                  <Button
                    type="submit"
                    fullWidth
                    sx={{
                      background: 'linear-gradient(90deg, #D9FF7A 0%, #C4FF4D 100%)',
                      color: 'black',
                      fontWeight: 'bold',
                      fontFamily: 'Bricolage Grotesque',
                      borderRadius: '50px',
                      padding: '12px',
                      textTransform: 'none',
                      fontSize: '16px',
                      '&:hover': {
                        background: 'linear-gradient(90deg, #C4FF4D 0%, #D9FF7A 100%)',
                      }
                    }}
                  >
                    <span className="mr-2">✨</span> Get My Offer
                  </Button>
                </form>
              </div>
            </div>

            {/* Hero Content */}
            <div className="w-full lg:w-1/2 text-center lg:text-left">
              <div className="mb-4">
                <span className="inline-flex items-center text-2xl md:text-3xl">
                  <span className="bg-[#FFD700] rounded-lg px-2 py-1 mr-2">⚡</span>
                </span>
                <h1 className="font-['Bricolage_Grotesque'] text-3xl md:text-5xl font-bold text-white leading-tight">
                  SELL YOUR CAR
                </h1>
                <h2 className="font-['glancyr'] text-4xl md:text-6xl font-bold text-white italic mt-2">
                  Fast, Fair &
                </h2>
                <div className="flex items-center justify-center lg:justify-start gap-2 mt-2">
                  <span className="bg-[#D1B3FF] rounded-full p-2">💰</span>
                  <h2 className="font-['glancyr'] text-4xl md:text-6xl font-bold text-white italic">
                    Hassle Free!
                  </h2>
                </div>
              </div>

              {/* Car Image */}
              <div className="relative mt-8 hidden lg:block">
                <img
                  src="/svg/course_car.svg"
                  alt="Car"
                  className="w-full max-w-lg mx-auto transform scale-x-[-1]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 md:py-16 px-4 md:px-8 bg-white -mt-8 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <FeatureCard
              bgColor="bg-[#FFD700]"
              icon={<span className="text-2xl">🏷️</span>}
              title="Free Valuation"
              description="See your car's value instantly, then profile your vehicle. Quick, easy to follow and vehicle is listed in few steps"
            />
            <FeatureCard
              bgColor="bg-[#FFB347]"
              icon={<span className="text-2xl">🏠</span>}
              title="Door Step Inspection"
              description="Our expert inspects the car and prepare a detailed report for final valuation"
            />
            <FeatureCard
              bgColor="bg-[#00CE84]"
              icon={<span className="text-2xl">💵</span>}
              title="Best Offer"
              description="Get offers from our buyer or learners who have learned driving with us. Speedy close of transaction"
            />
            <FeatureCard
              bgColor="bg-[#87CEEB]"
              icon={<span className="text-2xl">🔒</span>}
              title="Secure Deal"
              description="Accept the offer, handover the car to the buyer and we'll securely handle the payment and ownership transfer"
            />
          </div>
        </div>
      </section>

      {/* What Our Buyers Love Section */}
      <section className="py-12 md:py-20 px-4 md:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Title */}
            <div className="text-center md:text-left">
              <h2 className="font-['glancyr'] text-3xl md:text-5xl">
                <span className="relative">
                  <span className="bg-[#D1B3FF] px-2">What Our</span>
                </span>
              </h2>
              <h2 className="font-['glancyr'] text-4xl md:text-6xl text-[#D9FF7A] italic mt-2" style={{ WebkitTextStroke: '1px black' }}>
                Buyers
              </h2>
              <h2 className="font-['glancyr'] text-4xl md:text-6xl text-[#D9FF7A] italic" style={{ WebkitTextStroke: '1px black' }}>
                Love
              </h2>
            </div>

            {/* Signpost Stats */}
            <div className="relative flex items-center justify-center">
              {/* Pole */}
              <div className="absolute left-1/2 transform -translate-x-1/2 w-3 bg-gray-300 h-80 rounded-full z-0"></div>

              {/* Signs */}
              <div className="relative z-10 space-y-4">
                {/* SUV */}
                <div className="flex items-center">
                  <div className="text-right mr-4">
                    <span className="font-['Bricolage_Grotesque'] text-3xl font-bold">20%</span>
                    <p className="font-['Bricolage_Grotesque'] text-[#00CE84] font-bold">SUV</p>
                    <p className="font-['Bricolage_Grotesque'] text-xs text-gray-500">Learners are open<br/>to used SUVs</p>
                  </div>
                  <div className="w-16 h-12 bg-[#00CE84] rounded-lg"></div>
                </div>

                {/* Hatchback */}
                <div className="flex items-center justify-end">
                  <div className="w-20 h-14 bg-[#D9FF7A] rounded-lg mr-4"></div>
                  <div className="text-left">
                    <span className="font-['Bricolage_Grotesque'] text-3xl font-bold">45%</span>
                    <p className="font-['Bricolage_Grotesque'] text-[#D1B3FF] font-bold">HATCH<br/>BACK</p>
                    <p className="font-['Bricolage_Grotesque'] text-xs text-gray-500">Learners<br/>actively prefer used<br/>hatchbacks</p>
                  </div>
                </div>

                {/* Sedan */}
                <div className="flex items-center">
                  <div className="text-right mr-4">
                    <span className="font-['Bricolage_Grotesque'] text-3xl font-bold">35%</span>
                    <p className="font-['Bricolage_Grotesque'] text-[#D9FF7A] font-bold">SEDAN</p>
                    <p className="font-['Bricolage_Grotesque'] text-xs text-gray-500">Strong demand for<br/>used sedans</p>
                  </div>
                  <div className="w-14 h-10 bg-[#D1B3FF] rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 md:py-20 px-4 md:px-8 bg-[#D1B3FF]">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-['glancyr'] text-3xl md:text-5xl text-center mb-12">
            <span className="bg-[#D9FF7A] px-4 py-2 rounded-lg inline-block">How It Works?</span>
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <StepCard
              number="1"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
              title="List Your Car"
              description="Get an instant estimated price"
              bgColor="bg-[#D9FF7A]"
            />
            <StepCard
              number="2"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              title="Valuation"
              description="Expert car check + document verification"
              bgColor="bg-[#FFD700]"
            />
            <StepCard
              number="3"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>}
              title="Door Step Inspection"
              description="Price at your own terms"
              bgColor="bg-[#00CE84]"
            />
            <StepCard
              number="4"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>}
              title="RTO & Ownership"
              description="Lane handles ownership & paperwork end-to-end"
              bgColor="bg-[#87CEEB]"
            />
          </div>
        </div>
      </section>

      {/* Sellers Section */}
      <section className="py-12 md:py-20 px-4 md:px-8 bg-[#00CE84]">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="font-['Bricolage_Grotesque'] text-3xl md:text-4xl font-bold text-white mb-2">
            Sellers Are Already
          </h2>
          <h2 className="font-['glancyr'] text-3xl md:text-4xl font-bold text-white italic mb-4">
            <span className="bg-[#D9FF7A] text-black px-4 py-1 rounded-lg">Selling With Lane</span>
          </h2>
          <p className="font-['Bricolage_Grotesque'] text-white/90 mb-12 max-w-xl mx-auto">
            See how car owner's listed and sold with lane and list your vehicle in few steps and get started.
          </p>

          {/* Testimonials Carousel */}
          <div className="relative max-w-4xl mx-auto">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={prevTestimonial}
                className="absolute left-0 z-20 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-12">
                {testimonials.map((testimonial, index) => (
                  <SellerCard
                    key={index}
                    {...testimonial}
                    isMain={index === currentTestimonial}
                  />
                ))}
              </div>

              <button
                onClick={nextTestimonial}
                className="absolute right-0 z-20 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 md:py-20 px-4 md:px-8 bg-[#D1B3FF]">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/80 backdrop-blur rounded-3xl p-6 md:p-10">
            <h2 className="font-['Bricolage_Grotesque'] text-2xl md:text-4xl font-bold mb-8">
              Frequently Asked Questions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                {faqsLeft.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq}
                    isOpen={openFAQ === `left-${index}`}
                    onClick={() => setOpenFAQ(openFAQ === `left-${index}` ? null : `left-${index}`)}
                  />
                ))}
              </div>
              <div className="space-y-3">
                {faqsRight.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq}
                    isOpen={openFAQ === `right-${index}`}
                    onClick={() => setOpenFAQ(openFAQ === `right-${index}` ? null : `right-${index}`)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Road Animation before Footer */}
      <section className="bg-[#D1B3FF] pb-4 relative overflow-hidden">
        <div className="flex items-center justify-between px-4">
          <img src="/svg/car.png" alt="Car" className="w-8 h-8 md:w-12 md:h-12" />
          <div className="flex-1 mx-4 border-t-4 border-dashed border-gray-600"></div>
          <img src="/svg/car.png" alt="Car" className="w-8 h-8 md:w-12 md:h-12 transform scale-x-[-1]" />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Sell;
