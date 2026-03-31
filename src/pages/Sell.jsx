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
import { supabase } from "../supabaseClient";

// Car makes data
const carMakes = [
  "Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Honda", "Toyota",
  "Kia", "MG", "Volkswagen", "Skoda", "Renault", "Nissan", "Ford",
  "Jeep", "BMW", "Mercedes-Benz", "Audi", "Other"
];

// Car models mapping
const carModels = {
  "Maruti Suzuki": ["Swift", "Baleno", "Wagon R", "Alto", "Dzire", "Ertiga", "Brezza", "Fronx", "Grand Vitara", "Jimny", "Celerio", "Ignis", "Ciaz", "Other"],
  "Hyundai": ["Creta", "Venue", "i20", "Grand i10 Nios", "Verna", "Aura", "Tucson", "Alcazar", "Exter", "Santro", "Other"],
  "Tata": ["Nexon", "Punch", "Harrier", "Safari", "Altroz", "Tiago", "Tigor", "Other"],
  "Mahindra": ["Scorpio", "Scorpio-N", "XUV700", "XUV300", "Thar", "Bolero", "Marazzo", "Other"],
  "Honda": ["City", "Amaze", "Elevate", "Jazz", "WR-V", "Other"],
  "Toyota": ["Innova Crysta", "Innova Hycross", "Fortuner", "Glanza", "Urban Cruiser Hyryder", "Hilux", "Etios", "Other"],
  "Kia": ["Seltos", "Sonet", "Carens", "EV6", "Carnival", "Other"],
  "MG": ["Hector", "Astor", "Gloster", "Comet EV", "ZSEV", "Other"],
  "Volkswagen": ["Polo", "Vento", "Taigun", "Virtus", "Tiguan", "Other"],
  "Skoda": ["Slavia", "Kushaq", "Rapid", "Octavia", "Superb", "Kodiaq", "Other"],
  "Renault": ["Kwid", "Triber", "Kiger", "Duster", "Other"],
  "Nissan": ["Magnite", "Sunny", "Micra", "Kicks", "Other"],
  "Ford": ["EcoSport", "Endeavour", "Figo", "Aspire", "Freestyle", "Other"],
  "Jeep": ["Compass", "Meridian", "Wrangler", "Other"],
  "BMW": ["3 Series", "5 Series", "X1", "X3", "X5", "X7", "Other"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE", "S-Class", "Other"],
  "Audi": ["A4", "A6", "Q3", "Q5", "Q7", "Other"],
  "Other": ["Other"]
};



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
  <div className={`${bgColor} rounded-[20px] md:rounded-[24px] p-5 md:p-8 flex flex-col h-full min-h-[280px] border border-black shadow-[0px_4px_10px_rgba(0,0,0,0.25)]`}>
    <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-sm text-black flex-shrink-0">
      {icon}
    </div>
    <h3 className="w-full text-left font-['Bricolage_Grotesque'] font-bold text-[22px] sm:text-[28px] md:text-[42px] mb-2 md:mb-4 text-black leading-tight">{title}</h3>
    <p className="font-['Bricolage_Grotesque'] font-medium text-[13px] sm:text-[14px] md:text-[20px] text-black leading-snug tracking-tight sm:tracking-normal">{description}</p>
  </div>
));

// Step Card Component
const StepCard = memo(({ number, icon, title, description, bgColor }) => (
  <div className="bg-white rounded-[16px] md:rounded-[24px] p-1.5 md:p-3 flex flex-col h-full min-h-[200px] md:min-h-[240px] shadow-sm border border-gray-100/50 hover:-translate-y-1 md:hover:-translate-y-2 transition-transform duration-300">
    <div className="px-3 py-3 md:px-5 md:py-5 flex items-start justify-between">
      <span className="font-['Bricolage_Grotesque'] font-black text-[32px] sm:text-[40px] md:text-[64px] leading-none text-black tracking-tighter">{number}.</span>
      <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 flex-shrink-0">
        {icon}
      </div>
    </div>
    <div className={`${bgColor} flex-1 rounded-[12px] md:rounded-[20px] p-3 sm:p-4 md:p-6 mt-1 flex flex-col justify-start`}>
      <h4 className="font-['Bricolage_Grotesque'] font-bold text-[14px] sm:text-[16px] md:text-[22px] text-black mb-1 md:mb-3 leading-tight min-h-[36px] sm:min-h-[44px] md:min-h-[60px] flex items-start">{title}</h4>
      <p className="font-['Bricolage_Grotesque'] font-medium text-[11px] sm:text-[13px] md:text-[17px] text-black leading-snug tracking-tight sm:tracking-normal">{description}</p>
    </div>
  </div>
));

// Seller Testimonial Card
const SellerCard = memo(({ image, title, carName, quote, soldIn, whyLane, isMain }) => (
  <div className={`relative flex flex-col ${isMain ? 'scale-100 z-10 mt-0 shadow-[0_15px_40px_rgba(0,0,0,0.15)] md:min-h-[585px] rounded-[24px]' : 'scale-[0.95] opacity-100 mt-6 md:mt-12 shadow-lg h-auto rounded-[20px]'} transition-all duration-300 w-full`}>
    {/* The Badge */}
    <div
      className={`absolute -top-5 md:-top-6 left-1/2 transform -translate-x-1/2 z-30 flex items-center justify-center font-['Bricolage_Grotesque'] font-black tracking-tight whitespace-nowrap bg-no-repeat bg-center text-black ${isMain ? 'text-[18px] md:text-[24px] px-8 md:px-12 pt-[14px] pb-[8px] md:pt-[18px] md:pb-[12px]' : 'text-[14px] md:text-[18px] px-6 md:px-8 pt-[10px] pb-[6px] md:pt-[12px] md:pb-[8px]'}`}
      style={{
        backgroundImage: "url('/tag1.svg')",
        backgroundSize: '100% 100%'
      }}
    >
      {title}
    </div>

    <div className={`bg-white ${isMain ? 'rounded-[24px]' : 'rounded-[20px]'} overflow-hidden flex-1 flex flex-col border border-gray-100 relative z-20`}>
      <div className={`relative ${isMain ? 'h-56 md:h-[280px]' : 'h-40 md:h-[220px]'} flex-shrink-0 overflow-hidden border-b border-gray-100`}>
        <img src={image} alt={carName} className="w-full h-full object-cover" />
      </div>
      <div className={`flex-1 text-left bg-white flex flex-col ${isMain ? 'px-6 py-6 md:px-8 md:pt-8 md:pb-8' : 'px-4 py-4 md:px-6 md:py-6'}`}>
        <div className={`${isMain ? 'mb-6' : 'mb-4'}`}>
          <h4 className={`font-['Bricolage_Grotesque'] font-extrabold text-[#01D28C] leading-tight tracking-tight ${isMain ? 'text-[18px] md:text-[22px] mb-3' : 'text-[14px] md:text-[16px] mb-2'}`}>{carName}</h4>
          <p className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? 'text-[15px] md:text-[17px] leading-[1.5]' : 'text-[12px] md:text-[14px] leading-[1.4]'}`}>"{quote}"</p>
        </div>
        <div className={`mt-auto ${isMain ? 'space-y-2 pt-8' : 'space-y-1 pt-6'}`}>
          <p className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? 'text-[15px] md:text-[17px] leading-[1.4]' : 'text-[12px] md:text-[14px] leading-[1.4]'}`}>Sold in: {soldIn}</p>
          <p className={`font-['Bricolage_Grotesque'] text-[#000000] font-medium tracking-normal ${isMain ? 'text-[15px] md:text-[17px] leading-[1.4]' : 'text-[12px] md:text-[14px] leading-[1.4]'}`}><span className="text-[#01D28C] font-bold">Why Lane:</span> {whyLane}</p>
        </div>
      </div>
    </div>
  </div>
));

// FAQ Item Component
const FAQItem = memo(({ question, answer = "Answer coming soon...", isOpen, onClick }) => (
  <div className="relative w-full">
    <button
      onClick={onClick}
      title={question}
      className={`w-full flex items-center justify-between border border-black px-4 md:px-6 py-2 transition-colors
        ${isOpen
          ? 'bg-white rounded-t-[1rem] border-b-0'
          : 'bg-white rounded-[1rem]'
        }`}
    >
      <span className={`font-['Bricolage_Grotesque'] font-semibold text-[14px] md:text-[16px] text-left pr-2 ${isOpen ? 'line-clamp-4' : 'line-clamp-1'}`}>
        {question}
      </span>
      <svg
        className={`w-5 h-5 transition-transform text-[#525252] ${isOpen ? "rotate-180" : ""
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

    {isOpen && (
      <div className="bg-white px-4 md:px-6 py-2 md:py-3 rounded-b-[1rem] border border-t-0 border-black">
        <p className="font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[16px] text-gray-700 text-left leading-relaxed">
          {answer}
        </p>
      </div>
    )}
  </div>
));

const Sell = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [currentTestimonial, setCurrentTestimonial] = useState(1);
  const [openFAQ, setOpenFAQ] = useState(null);

  // Modal state for lead capture
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [estimatedOffer, setEstimatedOffer] = useState('');

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
    setFormData(prev => {
      if (name === 'make') {
        return { ...prev, [name]: value, model: '' }; // Reset model if make changes
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate that all fields are filled
    const { registrationNumber, make, model, year, fuelType, transmission, ownership } = formData;
    if (!registrationNumber || !make || !year || !fuelType || !transmission || !ownership) {
      alert('Please fill out all car details before proceeding.');
      return;
    }

    // Instead of finishing immediately, open the details popup
    setIsModalOpen(true);
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (!userName || !userPhone) {
      alert('Please fill in both Name and Phone Number.');
      return;
    }

    // Store lead in Supabase
    const { error } = await supabase.from('sell_leads').insert([
      {
        registration_number: formData.registrationNumber,
        make: formData.make,
        model: formData.model,
        year: formData.year,
        fuel_type: formData.fuelType,
        transmission: formData.transmission,
        ownership: formData.ownership,
        name: userName,
        phone: userPhone,
      },
    ]);

    if (error) {
      console.error('Error saving lead:', error);
      alert('Something went wrong. Please try again.');
      return;
    }

    // Generate estimated price based on inputs
    const currentYear = new Date().getFullYear();
    const carAge = currentYear - (formData.year ? parseInt(formData.year) : currentYear - 5);

    // Base price varies by fuel type
    let basePrice = 500000;
    if (formData.fuelType === 'Diesel') basePrice = 600000;
    else if (formData.fuelType === 'CNG') basePrice = 520000;
    else if (formData.fuelType === 'Electric') basePrice = 700000;

    // Depreciation: ~15% per year (compounding)
    const depreciationRate = 0.85;
    let price = basePrice * Math.pow(depreciationRate, carAge);

    // Transmission affects price
    if (formData.transmission === 'Automatic' || formData.transmission === 'DCT') {
      price *= 1.10;
    } else if (formData.transmission === 'CVT' || formData.transmission === 'AMT') {
      price *= 1.05;
    } else if (formData.transmission === 'Manual') {
      price *= 0.92;
    }

    // Ownership: each additional owner reduces value
    if (formData.ownership === '2nd Owner') price *= 0.88;
    else if (formData.ownership === '3rd Owner') price *= 0.78;
    else if (formData.ownership === '4th+ Owner') price *= 0.68;

    const finalMin = (price / 100000).toFixed(2);
    const finalMax = ((price + 50000) / 100000).toFixed(2);
    setEstimatedOffer(`₹${finalMin} Lakhs - ₹${finalMax} Lakhs`);

    // Close modal, load Result view
    setIsModalOpen(false);
    setShowResult(true);
  };

  const testimonials = [
    {
      title: "Seller profile 2",
      image: "/car2.png",
      carName: "2019 Honda City (Petrol)",
      quote: "I was worried about paperwork and ownership transfer. Everything was taken care of without me visiting the RTO.",
      soldIn: "4 days",
      whyLane: "End-to-end RTO support",
    },
    {
      title: "Seller profile 1",
      image: "/car1.png",
      carName: "Car: 2018 Hyundai i20 (Petrol)",
      quote: "Didn't want to deal with calls and bargaining. Lane handled the inspection, shared a clear price, and closed the sale smoothly.",
      soldIn: "6 days",
      whyLane: "Transparent pricing, zero hassle",
    },
    {
      title: "Seller profile 3",
      image: "/car3.png",
      carName: "2020 Maruti Baleno (Petrol)",
      quote: "The doorstep inspection made it easy. One fair offer, quick payment, and no last-minute deductions.",
      soldIn: "5 days",
      whyLane: "Fast, fair deal",
    },
  ];

  const faqsLeft = [
    { question: "What is Lane marketplace?", answer: "Lane marketplace is a transparent platform designed to help you sell your car seamlessly, ensuring you get the best market value through our vast network." },
    { question: "How is this different from market place platforms?", answer: "Unlike traditional classifieds, we handle everything from inspection to paperwork and RC transfer, guaranteeing a genuine buyer without constant phone calls." },
    { question: "How is my car's price decided?", answer: "Pricing is backed by real-time market data, the physical condition of the car, and immediate demand from our extensive dealer and buyer network." },
    { question: "Do you help with RC transfer and documentation?", answer: "Yes, we provide completely free end-to-end documentation and RC transfer support to ensure you face absolutely zero hassle." },
    { question: "Can I sell a car with a loan or minor issues?", answer: "Absolutely. We clear your pending loan with the bank on your behalf and purchase cars as-is, resolving any issues post-sale." },
    { question: "Why should I trust this platform?", answer: "We are an experienced team managing a transparent process where you are paid directly and securely before handing over the keys." },
  ];

  const faqsRight = [
    { question: "Who are the buyers on this platform?", answer: "Our network exclusively comprises verified dealerships and premium direct buyers looking for high-quality certified pre-owned cars." },
    { question: "Will I receive multiple calls or face bargaining?", answer: "No. You will only receive a single, fair offer from us based on inspection, eliminating any awkward haggling or endless calls." },
    { question: "How long does it usually take to sell a car?", answer: "Typically, most cars are inspected, approved, and fully paid for within 24 to 48 hours of your initial request." },
    { question: "Is the payment process safe?", answer: "Yes, 100% secure. The full payment is transferred to your bank account immediately before the car is even picked up from your doorstep." },
    { question: "Do you purchase the car yourself?", answer: "We act as the marketplace facilitator connecting you to our verified network effortlessly, ensuring you receive the absolute best value." },
  ];

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="bg-white overflow-x-hidden">
      <Helmet>
        <title>Sell Your Car - InLane | Fast, Fair & Hassle Free</title>
        <meta
          name="description"
          content="Sell your car fast, fair and hassle-free with InLane. Get free valuation, doorstep inspection, and best offers from verified buyers."
        />
      </Helmet>

      <Navbar2 backgroundColor='#FFFFFF' logo='/LANE_LOGO.svg' burgerMenu='/PurpleHamburger.png' />

      <section className="bg-[#00CE84] min-h-[750px] relative z-20 -mt-[2px] md:-mt-[4px] flex flex-col items-center md:items-start md:block pb-10 md:pb-0">

        {/* Background Watermark Pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('/White BG Pattern.svg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'repeat' }}></div>

        {/* Car Image - Positioned bottom right */}
        <div className="relative md:absolute order-2 md:order-none mt-4 md:mt-0 md:-bottom-[5%] lg:-bottom-[12%] md:-right-[2%] lg:right-[5%] w-[110%] md:w-[85%] lg:w-[65%] max-w-[850px] z-20 pointer-events-none self-center flex justify-center">
          <img
            src="/MainCar.png"
            alt="Car"
            className="w-[95%] md:w-full h-auto ml-auto object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.3)]"
          />
        </div>

        {/* Headlines - Top Right */}
        <div className="relative md:absolute order-1 md:order-none top-8 md:top-6 lg:top-8 right-0 md:right-[5%] lg:right-[8%] z-30 flex flex-col items-center w-full md:w-auto mt-[40px] md:mt-0 px-4 md:px-0">

          <div className="relative flex flex-col items-center w-full px-2 sm:px-4">
            <img
              src="/sales_tag.png"
              alt="Sell Your Car, Fast, Fair & Hassle Free"
              className="w-[90%] sm:w-full max-w-[450px] md:max-w-[600px] lg:max-w-[750px] object-contain drop-shadow-lg"
            />
          </div>
        </div>

        {/* Form - Left side */}
        <div className="relative md:absolute order-3 md:order-none -mt-4 sm:-mt-8 md:mt-0 md:top-[48%] md:-translate-y-1/2 left-0 right-0 md:left-12 lg:left-[8%] z-10 w-[94%] sm:w-[88%] mx-auto md:mx-0 md:w-[48%] lg:w-[42%] max-w-[540px] drop-shadow-2xl">
          <div className="bg-[#FCFCFC] rounded-[20px] md:rounded-[24px] p-6 sm:p-7 md:p-8 lg:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-200">
            {showResult ? (
              <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500 py-4">
                <div className="w-16 h-16 bg-[#00CE84]/10 rounded-full flex items-center justify-center mb-6">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="font-['Bricolage_Grotesque'] text-[24px] font-extrabold text-black mb-3">Your Valuation Is Ready!</h3>
                <p className="font-['Bricolage_Grotesque'] text-gray-600 text-[14px] leading-relaxed mb-6">Based on the details provided, here is the estimated market value for your {formData.year} {formData.make} {formData.model}:</p>
                <div className="w-full bg-[#F3FFB6] rounded-[16px] py-6 px-4 mb-6 border border-[#00CE84]/30 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                  <p className="font-['Bricolage_Grotesque'] text-[#00CE84] font-black text-2xl md:text-3xl tracking-tight leading-none">{estimatedOffer}</p>
                </div>
                <p className="font-['Bricolage_Grotesque'] text-[13px] text-gray-400 mb-8 px-2 leading-relaxed">Our execution expert will call you at <span className="text-black font-semibold">{userPhone}</span> shortly to schedule a free doorstep inspection and finalize your offer!</p>
                <button
                  onClick={() => { setShowResult(false); setFormData({ registrationNumber: '', make: '', model: '', year: '', fuelType: '', transmission: '', ownership: '' }); setUserName(''); setUserPhone(''); }}
                  className="w-full bg-black hover:bg-gray-800 text-white font-['Bricolage_Grotesque'] font-bold text-[15px] py-4 rounded-full transition-all duration-200"
                >
                  Start New Valuation
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col space-y-3 md:space-y-4 w-full">
                {/* Registration Input */}
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleChange}
                  placeholder="Car Registration Number"
                  className="w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] text-gray-800 placeholder-black/40 focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] transition-all"
                />

                {/* Grid 1: Make & Model */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="make"
                      value={formData.make}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.make ? 'text-black/40' : 'text-gray-800'}`}
                    >
                      <option value="" disabled>Make</option>
                      {carMakes.map(make => <option key={make} value={make} className="text-gray-800">{make}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="model"
                      value={formData.model}
                      onChange={handleChange}
                      disabled={!formData.make}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.model ? 'text-black/40' : 'text-gray-800'} ${!formData.make ? 'opacity-70 cursor-not-allowed bg-gray-50' : ''}`}
                    >
                      <option value="" disabled>Model</option>
                      {formData.make && carModels[formData.make] && carModels[formData.make].map(model => (
                        <option key={model} value={model} className="text-gray-800">{model}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>

                {/* Grid 2: Year & Fuel Type */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="year"
                      value={formData.year}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.year ? 'text-black/40' : 'text-gray-800'}`}
                    >
                      <option value="" disabled>Year</option>
                      {years.map(year => <option key={year} value={year} className="text-gray-800">{year}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="fuelType"
                      value={formData.fuelType}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.fuelType ? 'text-black/40' : 'text-gray-800'}`}
                    >
                      <option value="" disabled>Fuel Type</option>
                      {fuelTypes.map(fuel => <option key={fuel} value={fuel} className="text-gray-800">{fuel}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>

                {/* Grid 3: Transmission & Ownership */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-4">
                  <div className="relative w-full">
                    <select
                      name="transmission"
                      value={formData.transmission}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.transmission ? 'text-black/40' : 'text-gray-800'}`}
                    >
                      <option value="" disabled>Transmission</option>
                      {transmissionTypes.map(trans => <option key={trans} value={trans} className="text-gray-800">{trans}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>

                  <div className="relative w-full">
                    <select
                      name="ownership"
                      value={formData.ownership}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-full border border-black bg-white px-5 sm:px-6 py-2.5 md:py-2.5 font-['Bricolage_Grotesque'] font-medium text-[14px] md:text-[15px] transition-all focus:outline-none focus:border-[#00CE84] focus:ring-1 focus:ring-[#00CE84] ${!formData.ownership ? 'text-black/40' : 'text-gray-800'}`}
                    >
                      <option value="" disabled>Ownership</option>
                      {ownershipTypes.map(owner => <option key={owner} value={owner} className="text-gray-800">{owner}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-4 md:right-5 top-1/2 -translate-y-1/2">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-gray-400" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-center pt-3 pb-2">
                  <button
                    type="submit"
                    className="hover:-translate-y-0.5 transition-transform duration-200"
                  >
                    <img
                      src="/button.png"
                      alt="Get My Offer"
                      className="h-[46px] md:h-[52px] xl:h-[56px] w-auto object-contain drop-shadow-sm hover:drop-shadow-md transition-all"
                    />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="-mt-1 pt-16 sm:pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-8 bg-[#00CE84] relative z-0 overflow-hidden">
        {/* Background Watermark Pattern (continued from Hero) */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('/White BG Pattern.svg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'repeat' }}></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* Free Valuation - Yellow-Green */}
            <FeatureCard
              bgColor="bg-[#D9FF7A]"
              icon={<img src="/l1.png" alt="Free Valuation Icon" className="w-full h-full object-contain" />}
              title={<>Free<br />Valuation</>}
              description="See your car's value instantly, then profile your vehicle. Quick, easy to follow and vehicle is listed in few steps"
            />
            {/* Door Step Inspection - Orange */}
            <FeatureCard
              bgColor="bg-[#FFC229]"
              icon={<img src="/l2.png" alt="Door Step Inspection Icon" className="w-full h-full object-contain" />}
              title={<>Door Step<br />Inspection</>}
              description="Our expert inspects the car and prepare a detailed report for final valuation"
            />
            {/* Best Offer - Magenta/Pink */}
            <FeatureCard
              bgColor="bg-[#FF99F5]"
              icon={<img src="/l3.png" alt="Best Offer Icon" className="w-full h-full object-contain" />}
              title={<>Best<br />Offer</>}
              description="Get offers from our buyer or learners who have learned driving with us. Speedy close of transaction"
            />
            {/* Secure Deal - Cyan/Blue */}
            <FeatureCard
              bgColor="bg-[#87CEEB]"
              icon={<img src="/l4.png" alt="Secure Deal Icon" className="w-full h-full object-contain" />}
              title={<>Secure<br />Deal</>}
              description="Accept the offer, handover the car to the buyer and we'll securely handle the payment and ownership transfer"
            />
          </div>
        </div>
      </section>

      {/* What Our Buyers Love Section */}
      <section className="pt-4 md:pt-6 pb-0 px-4 md:px-8 bg-white relative z-10 flex overflow-visible">
        <div className="max-w-[1305px] mx-auto w-full flex items-stretch">
          <div className="flex flex-col md:flex-row items-center md:items-stretch justify-between w-full gap-0 md:gap-16">
            {/* Title */}
            <div className="text-center md:text-left w-full md:w-[45%] lg:w-[40%] flex flex-col items-center md:items-start pl-0 md:pl-10 lg:pl-8 self-center pb-4 md:pb-8">
              <img src="/s2_text.png" alt="What Our Buyers Love" className="w-[85%] md:w-full max-w-[400px] md:max-w-[500px] object-contain drop-shadow-md" />
            </div>

            {/* Signpost Stats */}
            <div className="relative w-full md:w-[55%] lg:w-[60%] flex items-end justify-center md:justify-end xl:pr-10 z-20 mt-4 md:mt-0">
              <div className="relative w-full max-w-[400px] md:max-w-[713px] flex justify-center items-end bottom-0">
                <img src="/polewithdesc.png" alt="What Buyers Love Stats" className="w-full h-auto object-contain object-bottom md:mb-[-1px]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-8 md:py-12 px-4 md:px-8 bg-[#D1B3FF]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 flex justify-center">
            <div className="relative inline-block mt-4 md:mt-6 mb-4">
              {/* Green background for title */}
              <div
                className="absolute -inset-y-4 -inset-x-6 md:-inset-y-6 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                style={{
                  backgroundImage: "url('/s3_bkg.png')",
                  backgroundSize: '100% 100%'
                }}
              ></div>
              <img src="/s3_text.png" alt="How It Works?" className="relative z-10 w-full max-w-[280px] md:max-w-[380px] object-contain drop-shadow-md px-2 py-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-6 md:mt-10">
            <StepCard
              number="1"
              icon={<img src="/1.png" alt="List Your Car" className="w-full h-full object-contain" />}
              title="List Your Car"
              description="Get an instant estimated price"
              bgColor="bg-[#D8FF7A]"
            />
            <StepCard
              number="2"
              icon={<img src="/2.png" alt="Valuation" className="w-full h-full object-contain" />}
              title="Valuation"
              description="Expert car check + document verification"
              bgColor="bg-[#FFB03A]"
            />
            <StepCard
              number="3"
              icon={<img src="/3.png" alt="Door Step Inspection" className="w-full h-full object-contain" />}
              title="Door Step Inspection"
              description="Price at your own terms"
              bgColor="bg-[#00CE84]"
            />
            <StepCard
              number="4"
              icon={<img src="/4.png" alt="RTO & Ownership" className="w-full h-full object-contain" />}
              title="RTO & Ownership"
              description="Lane handles ownership & paperwork end-to-end"
              bgColor="bg-[#7FEFFF]"
            />
          </div>
        </div>
      </section>

      {/* Sellers Section */}
      <section className="bg-white overflow-visible">
        {/* Top Green Part */}
        <div className="bg-[#00CE84] pt-12 sm:pt-16 md:pt-24 pb-8 sm:pb-12 md:pb-16 px-4 md:px-8 text-center flex flex-col items-center">
          <div className="w-full max-w-[1300px] flex flex-col items-center">
            <img
              src="/s4.png"
              alt="Sellers Are Already Selling With Lane"
              className="w-[90%] md:w-full max-w-[500px] lg:max-w-[700px] object-contain relative z-20"
            />
            <p className="font-['Bricolage_Grotesque'] text-[#000000] text-[13px] sm:text-[18px] md:text-[26px] font-normal mt-4 md:mt-6 lg:mt-8 max-w-[612px] leading-[1.4] mx-auto tracking-normal relative z-20">
              See how car owner's listed and sold with lane and<br className="hidden md:block" /> list your vehicle in few steps and get started.
            </p>
          </div>
        </div>

        {/* Bottom White Part containing Carousel */}
        <div className="bg-white relative z-10 px-4 md:px-8 pt-16 md:pt-20 pb-20 md:pb-28">
          <div className="max-w-[1300px] mx-auto text-center relative">
            {/* Testimonials Carousel */}
            <div className="relative w-full mx-auto px-0 md:px-4 overflow-x-hidden md:overflow-visible py-8 md:py-0">

              {/* Desktop Infinite Carousel */}
              <div className="hidden md:grid grid-cols-[26fr_48fr_26fr] gap-8 w-full items-start relative z-10 transition-all duration-300">
                {[
                  testimonials[(currentTestimonial - 1 + testimonials.length) % testimonials.length],
                  testimonials[currentTestimonial],
                  testimonials[(currentTestimonial + 1) % testimonials.length]
                ].map((testimonial, idx) => {
                  const isMain = idx === 1;
                  return (
                    <div key={testimonial.title + idx} className={`${isMain ? 'block relative z-30 h-full' : 'hidden md:block relative z-10 h-auto'} transition-all duration-500`}>
                      <SellerCard
                        {...testimonial}
                        isMain={isMain}
                      />
                      {/* Render arrows attached only to the main card */}
                      {isMain && (
                        <>
                          <button
                            onClick={prevTestimonial}
                            className="absolute top-[140px] -translate-y-1/2 left-0 -translate-x-1/2 z-40 w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20"
                          >
                            <ChevronLeft className="w-8 h-8" />
                          </button>
                          <button
                            onClick={nextTestimonial}
                            className="absolute top-[140px] -translate-y-1/2 right-0 translate-x-1/2 z-40 w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20"
                          >
                            <ChevronRight className="w-8 h-8" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mobile Dynamic Height Layout */}
              <div className="flex md:hidden w-full relative z-10 justify-center items-start pb-8">
                {/* Left Card */}
                <div className="absolute top-6 -left-[70%] w-[80%] z-10">
                  <SellerCard {...testimonials[(currentTestimonial - 1 + testimonials.length) % testimonials.length]} isMain={false} />
                </div>

                {/* Right Card */}
                <div className="absolute top-6 -right-[70%] w-[80%] z-10">
                  <SellerCard {...testimonials[(currentTestimonial + 1) % testimonials.length]} isMain={false} />
                </div>

                {/* Main Card (Relative positioning gives container dynamic height) */}
                <div className="relative w-[80%] z-30">
                  <SellerCard {...testimonials[currentTestimonial]} isMain={true} />

                  {/* Arrows placed precisely over the car image, straddling the bounds. */}
                  <button
                    onClick={prevTestimonial}
                    className="absolute top-[90px] left-0 -translate-x-1/2 z-40 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20 shadow-md"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextTestimonial}
                    className="absolute top-[90px] right-0 translate-x-1/2 z-40 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all text-white border border-white/20 shadow-md"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 px-4 md:px-8 bg-[#D1B3FF] relative z-0 overflow-hidden">
        {/* Background Watermark Pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('/White BG Pattern.svg')", backgroundSize: '1000px', backgroundPosition: 'center', backgroundRepeat: 'repeat' }}></div>

        <div className="max-w-[1305px] mx-auto relative z-10 w-full flex justify-center">
          <div className="bg-white rounded-[24px] md:rounded-[40px] p-6 md:px-[60px] md:py-[50px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] h-auto w-full max-w-[1050px]">
            <img
              src="/faq_tag.png"
              alt="Frequently Asked Questions"
              className="w-[85%] sm:w-[70%] md:w-[60%] max-w-[500px] h-auto object-contain mb-6 md:mb-[32px] block"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-[40px] gap-y-3 md:gap-y-[10px]">
              <div className="flex flex-col items-start space-y-3 md:space-y-[12px] w-full">
                {faqsLeft.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQ === `left-${index}`}
                    onClick={() => setOpenFAQ(openFAQ === `left-${index}` ? null : `left-${index}`)}
                  />
                ))}
              </div>
              <div className="flex flex-col items-start space-y-3 md:space-y-[12px] w-full">
                {faqsRight.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQ === `right-${index}`}
                    onClick={() => setOpenFAQ(openFAQ === `right-${index}` ? null : `right-${index}`)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Capture Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-[24px] p-8 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-6">
              <h3 className="font-['Bricolage_Grotesque'] text-[24px] font-extrabold text-black mb-2">Almost exactly there!</h3>
              <p className="font-['Bricolage_Grotesque'] text-gray-600 text-sm">Please tell us who we're valuing this car for so we can send you the offer.</p>
            </div>

            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block font-['Bricolage_Grotesque'] text-sm font-semibold text-gray-700 mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 rounded-[12px] border border-gray-200 focus:border-[#00CE84] focus:ring-2 focus:ring-[#00CE84]/20 outline-none transition-all font-['Bricolage_Grotesque']"
                />
              </div>

              <div>
                <label className="block font-['Bricolage_Grotesque'] text-sm font-semibold text-gray-700 mb-1">Your Phone Number</label>
                <input
                  type="tel"
                  required
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-4 py-3 rounded-[12px] border border-gray-200 focus:border-[#00CE84] focus:ring-2 focus:ring-[#00CE84]/20 outline-none transition-all font-['Bricolage_Grotesque']"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-6 bg-[#00CE84] hover:bg-[#00b574] text-white font-['Bricolage_Grotesque'] font-bold text-lg py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,206,132,0.39)] hover:shadow-[0_6px_20px_rgba(0,206,132,0.23)] hover:-translate-y-1 transition-all duration-200"
              >
                Get My Valuation Now
              </button>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Sell;
