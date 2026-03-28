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
  <div className={`${bgColor} rounded-[20px] md:rounded-[24px] p-5 md:p-8 flex flex-col h-auto md:h-[416px] border border-black shadow-[0px_4px_10px_rgba(0,0,0,0.25)]`}>
    <div className="w-8 h-8 md:w-12 md:h-12 bg-white rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-sm text-black">
      {icon}
    </div>
    <h3 className="font-['glancyr'] font-medium text-[22px] sm:text-[28px] md:text-[42px] mb-2 md:mb-4 text-black leading-none tracking-normal">{title}</h3>
    <p className="font-['Bricolage_Grotesque'] font-medium text-[13px] sm:text-[14px] md:text-[20px] text-black leading-snug tracking-normal">{description}</p>
  </div>
));

// Step Card Component
const StepCard = memo(({ number, icon, title, description, bgColor }) => (
  <div className="bg-white rounded-[16px] md:rounded-[24px] p-1.5 md:p-3 flex flex-col h-[220px] sm:h-[250px] md:h-[300px] shadow-sm border border-gray-100/50 hover:-translate-y-1 md:hover:-translate-y-2 transition-transform duration-300">
    <div className="px-3 py-3 md:px-5 md:py-5 flex items-start justify-between">
      <span className="font-['Bricolage_Grotesque'] font-black text-[32px] sm:text-[40px] md:text-[64px] leading-none text-black tracking-tighter">{number}.</span>
      <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 flex-shrink-0">
        {icon}
      </div>
    </div>
    <div className={`${bgColor} flex-1 rounded-[12px] md:rounded-[20px] p-3 sm:p-4 md:p-6 mt-1 flex flex-col justify-start`}>
      <h4 className="font-['Bricolage_Grotesque'] font-bold text-[14px] sm:text-[16px] md:text-[22px] text-black mb-1 md:mb-2 leading-tight">{title}</h4>
      <p className="font-['Bricolage_Grotesque'] font-medium text-[11px] sm:text-[13px] md:text-[17px] text-black leading-snug">{description}</p>
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
const FAQItem = memo(({ question, isOpen, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-3 sm:gap-4 md:gap-8 bg-white border border-[#000000] rounded-[24px] md:rounded-[50px] px-5 sm:px-6 md:px-8 py-3 md:py-[14px] text-left hover:shadow-md transition-all"
  >
    <span className="font-['Bricolage_Grotesque'] text-[14px] sm:text-[16px] md:text-[26px] font-semibold text-black tracking-normal leading-tight">{question}</span>
    <ChevronDown className={`w-5 h-5 md:w-8 md:h-8 text-black flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
  </button>
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
    setFormData(prev => ({ ...prev, [name]: value }));
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

    // Generate dummy price calculation based on inputs
    const basePrice = 300000;
    const yearMod = (formData.year ? parseInt(formData.year) - 2010 : 5) * 40000;
    const finalMin = ((basePrice + yearMod) / 100000).toFixed(2);
    const finalMax = ((basePrice + yearMod + 50000) / 100000).toFixed(2);
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

      <Navbar2 backgroundColor='#FFFFFF' logo='/LANE_LOGO.svg' burgerMenu='/PurpleHamburger.png' />

      <section className="bg-[#00CE84] min-h-[750px] relative overflow-hidden -mt-[2px] md:-mt-[4px] flex flex-col items-center md:items-start md:block pb-10 md:pb-0">

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

          <div className="relative flex flex-col items-center">
            {/* SELL YOUR CAR with lightning coin */}
            <div className="flex items-center justify-center gap-2 md:gap-3 w-full md:w-auto ml-0 md:ml-[-3rem] mb-2 md:mb-1">
              <img src="/Group.png" alt="Lightning" className="w-[30px] h-[30px] md:w-[55px] md:h-[55px] object-contain drop-shadow" />
              <h1 className="font-['Bricolage_Grotesque'] text-[30px] sm:text-[36px] md:text-[42px] lg:text-[48px] font-extrabold text-white tracking-widest uppercase text-center">
                SELL YOUR CAR
              </h1>
            </div>

            {/* Main Text Block */}
            <div className="relative flex flex-col items-center">
              
              {/* Fast, Fair & */}
              <div className="relative ml-0 md:ml-[-4rem]">
                <h2 className="relative z-40 font-['Bricolage_Grotesque'] font-bold text-[55px] sm:text-[65px] md:text-[94.64px] leading-[1.02] text-center tracking-[-0.03em]"
                  style={{
                    color: '#D9FF7A',
                    textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 1px 0 #000, 1px 0 0 #000, 0 -1px 0 #000, -1px 0 0 #000, 0px 4px 10px rgba(0,0,0,0.25)'
                  }}>
                  Fast, Fair &
                </h2>
                
                {/* Purple Dollar Coin */}
                <img
                  src="/dollar.png"
                  alt="Dollar"
                  className="absolute -top-[15px] md:-top-[5px] -right-[30px] sm:-right-[40px] md:-right-[65px] lg:-right-[75px] w-[60px] h-[60px] sm:w-[85px] sm:h-[85px] md:w-[105px] md:h-[105px] lg:w-[125px] lg:h-[125px] object-contain rotate-[-15deg] z-30"
                  style={{ filter: 'drop-shadow(2px 3px 0px rgba(0,0,0,0.3))' }}
                />
              </div>

              {/* Hassle Free! */}
              <div className="relative mt-2 ml-0 sm:ml-[2rem] md:ml-[4rem]">
                {/* Blue Balance Coin */}
                <img src="/balance.png" alt="Balance" className="absolute -left-[30px] md:-left-[50px] bottom-[5px] md:bottom-[10px] w-[50px] h-[50px] md:w-[85px] md:h-[85px] object-contain z-30" style={{ filter: 'drop-shadow(2px 3px 0px rgba(0,0,0,0.3))' }} />

                <h2 className="relative z-40 font-['Bricolage_Grotesque'] font-bold text-[55px] sm:text-[65px] md:text-[94.64px] leading-[1.02] tracking-[-0.03em]"
                  style={{
                    color: '#D9FF7A',
                    textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 1px 0 #000, 1px 0 0 #000, 0 -1px 0 #000, -1px 0 0 #000, 0px 4px 10px rgba(0,0,0,0.25)'
                  }}>
                  Hassle Free!
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* Form - Left side */}
        <div className="relative md:absolute order-3 md:order-none -mt-4 sm:-mt-8 md:mt-0 md:top-[48%] md:-translate-y-1/2 left-0 right-0 md:left-12 lg:left-[10%] z-40 w-[92%] sm:w-[85%] mx-auto md:mx-0 md:w-[45%] lg:w-[35%] max-w-[480px] drop-shadow-2xl">
          <div className="bg-white rounded-[24px] md:rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-gray-100 md:border-none">
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
                  onClick={() => { setShowResult(false); setFormData({registrationNumber: '', make: '', model: '', year: '', fuelType: '', transmission: '', ownership: ''}); setUserName(''); setUserPhone(''); }}
                  className="w-full bg-black hover:bg-gray-800 text-white font-['Bricolage_Grotesque'] font-bold text-[15px] py-4 rounded-full transition-all duration-200"
                >
                  Start New Valuation
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <TextField
                fullWidth
                variant="outlined"
                name="registrationNumber"
                value={formData.registrationNumber}
                onChange={handleChange}
                placeholder="Car Registration Number"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '50px',
                    fontFamily: 'Bricolage Grotesque',
                    backgroundColor: '#fff',
                  }
                }}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <FormControl fullWidth>
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

                <FormControl fullWidth>
                  <Select
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    displayEmpty
                    sx={{
                      borderRadius: '50px',
                      fontFamily: 'Bricolage Grotesque',
                    }}
                  >
                    <MenuItem value="" disabled>Model</MenuItem>
                  </Select>
                </FormControl>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <FormControl fullWidth>
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

                <FormControl fullWidth>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <FormControl fullWidth>
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

                <FormControl fullWidth>
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

              <div className="flex justify-center pt-4">
                <Button
                  type="submit"
                  sx={{
                    background: 'linear-gradient(90deg, #00CE84 0%, #00B876 100%)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontFamily: 'Bricolage Grotesque',
                    borderRadius: '50px',
                    padding: '14px 48px',
                    textTransform: 'none',
                    fontSize: '16px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #00B876 0%, #00CE84 100%)',
                      boxShadow: '0 6px 8px rgba(0,0,0,0.15)',
                    }
                  }}
                >
                  <span className="mr-2">✨</span> Get My Offer
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="pt-16 sm:pt-24 md:pt-40 pb-16 md:pb-24 px-4 md:px-8 bg-[#00CE84] relative z-0 overflow-hidden">
        {/* Background Watermark Pattern (continued from Hero) */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('/White BG Pattern.svg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'repeat' }}></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* Free Valuation - Yellow-Green */}
            <FeatureCard
              bgColor="bg-[#D9FF7A]"
              icon={
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Free Valuation"
              description="See your car's value instantly, then profile your vehicle. Quick easy to follow and vehicle is listed in few steps"
            />
            {/* Door Step Inspection - Orange */}
            <FeatureCard
              bgColor="bg-[#FFC229]"
              icon={
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
              title="Door Step Inspection"
              description="Our expert inspects the car and prepare a detailed report for final valuation"
            />
            {/* Best Offer - Magenta/Pink */}
            <FeatureCard
              bgColor="bg-[#FF69B4]"
              icon={
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Best Offer"
              description="Get offers from our buyer or learners who have learned driving with us. Speedy close of transaction"
            />
            {/* Secure Deal - Cyan/Blue */}
            <FeatureCard
              bgColor="bg-[#87CEEB]"
              icon={
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
              title="Secure Deal"
              description="Accept the offer, handover the car to the buyer and we'll securely handle the payment and ownership transfer"
            />
          </div>
        </div>
      </section>

      {/* What Our Buyers Love Section */}
      <section className="pt-20 md:pt-32 pb-0 px-4 md:px-8 bg-white relative z-10 flex overflow-visible">
        <div className="max-w-[1305px] mx-auto w-full flex items-stretch">
          <div className="flex flex-col md:flex-row items-center md:items-stretch justify-between w-full gap-0 md:gap-16">
            {/* Title */}
            <div className="text-center md:text-left w-full md:w-[45%] lg:w-[40%] flex flex-col items-center md:items-start pl-0 md:pl-10 lg:pl-8 self-center pb-4 md:pb-32">
              <h2 className="font-['glancyr'] text-[60px] md:text-[96px] lg:text-[120px] text-[#D8FF7A] tracking-normal leading-[0.85] text-center md:text-left" style={{ WebkitTextStroke: '2px black' }}>
                What<br />Our
              </h2>
              <div className="flex flex-col items-center md:items-start mt-2 md:mt-6 lg:mt-8 space-y-4 md:space-y-8 lg:space-y-12">
                {/* Buyers */}
                <div className="relative inline-block w-fit">
                  <div
                    className="absolute -inset-y-3 -inset-x-6 md:-inset-y-5 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                    style={{
                      backgroundImage: "url('/tag 8.svg')",
                      backgroundSize: '100% 100%'
                    }}
                  ></div>
                  <h2 className="relative z-10 font-['glancyr'] text-[60px] md:text-[96px] lg:text-[120px] text-white leading-[0.85]" style={{ WebkitTextStroke: '2px black' }}>
                    Buyers
                  </h2>
                </div>

                {/* Love */}
                <div className="relative inline-block w-fit ml-0 md:ml-4 lg:ml-6 mt-4 md:mt-0">
                  <div
                    className="absolute -inset-y-3 -inset-x-6 md:-inset-y-5 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                    style={{
                      backgroundImage: "url('/tag 8.svg')",
                      backgroundSize: '100% 100%'
                    }}
                  ></div>
                  <h2 className="relative z-10 font-['glancyr'] text-[60px] md:text-[96px] lg:text-[120px] text-white leading-[0.85]" style={{ WebkitTextStroke: '2px black' }}>
                    Love
                  </h2>
                </div>
              </div>
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
      <section className="py-16 md:py-24 px-4 md:px-8 bg-[#D1B3FF]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 flex justify-center">
            <div className="relative inline-block mt-4 md:mt-6 mb-4">
              {/* Lime green stroke image from Figma */}
              <div
                className="absolute -inset-y-4 -inset-x-6 md:-inset-y-6 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                style={{
                  backgroundImage: "url('/tag1.svg')",
                  backgroundSize: '100% 100%'
                }}
              ></div>
              <h2 className="relative z-10 font-['glancyr'] text-4xl md:text-6xl text-white tracking-wider px-2 py-1" style={{ WebkitTextStroke: '2px black' }}>
                How It Works?
              </h2>
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
            <h2 className="font-['Bricolage_Grotesque'] text-[32px] sm:text-5xl md:text-[72px] font-semibold text-[#0A0A0A] leading-[1.1] mb-0 relative z-20">
              Sellers Are Already
            </h2>
            <div className="relative inline-block mt-1 md:-mt-2 lg:-mt-3 md:mb-2 flex justify-center">
              {/* Lime green stroke image from Figma */}
              <div
                className="absolute -inset-y-2 -inset-x-4 md:-inset-y-6 md:-inset-x-8 z-0 bg-no-repeat bg-center"
                style={{
                  backgroundImage: "url('/tag1.svg')",
                  backgroundSize: '100% 100%'
                }}
              ></div>
              <h2 className="relative z-10 font-['Bricolage_Grotesque'] text-[32px] sm:text-5xl md:text-[72px] font-semibold text-[#0A0A0A] leading-[1.1] px-2 md:px-4 py-1 md:py-2 tracking-normal">
                Selling With Lane
              </h2>
            </div>
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
              <div className="hidden md:grid grid-cols-[26%_48%_26%] gap-8 w-full items-start relative z-10 transition-all duration-300">
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
        
        <div className="max-w-[1305px] mx-auto relative z-10 w-full">
          <div className="bg-white rounded-[32px] md:rounded-[48px] p-6 md:px-[80px] md:py-[80px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] md:min-h-[765px]">
            <h2 className="font-['glancyr'] text-3xl md:text-[42px] font-medium text-black mb-10 md:mb-[60px] text-left leading-[1.2]">
              Frequently Asked Questions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-[40px] gap-y-4 md:gap-y-[24px]">
              <div className="flex flex-col items-start space-y-4 md:space-y-[24px]">
                {faqsLeft.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq}
                    isOpen={openFAQ === `left-${index}`}
                    onClick={() => setOpenFAQ(openFAQ === `left-${index}` ? null : `left-${index}`)}
                  />
                ))}
              </div>
              <div className="flex flex-col items-start space-y-4 md:space-y-[24px]">
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
