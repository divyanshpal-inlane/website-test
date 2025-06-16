import React, { useState, useEffect, useCallback, memo } from 'react';
import faqData from '../../data/faq';
import Navbar2 from '../Navbar2';
import Footer from '../Footer';

// Memoized FAQ Item for performance
const FAQItem = memo(({ faq, isActive, onClick, searchTerm }) => (
  <div className="relative transform transition-all duration-300 hover:scale-[1.02]">
    <button
      onClick={onClick}
      title={faq.question}
      className={`w-full flex items-center justify-between border border-black px-4 md:px-6 py-3 transition-all duration-300
        ${isActive
          ? 'bg-white rounded-t-[1rem] border-b-0 shadow-lg'
          : 'bg-white rounded-[1rem] hover:shadow-md'
        }`}
    >
      <span className={`font-grotesque text-sm md:text-base text-left pr-2 ${isActive ? 'line-clamp-4' : 'line-clamp-2'}`}>
        {searchTerm ? (
          <span dangerouslySetInnerHTML={{
            __html: faq.question.replace(
              new RegExp(`(${searchTerm})`, 'gi'),
              '<span class="search-highlight">$1</span>'
            )
          }} />
        ) : (
          faq.question
        )}
      </span>
      <svg
        className={`w-5 h-5 transition-transform duration-300 text-gray-500 flex-shrink-0 ${isActive ? "rotate-180" : ""}`}
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
    {isActive && (
      <div className="bg-white px-4 md:px-6 py-3 md:py-4 rounded-b-[1rem] border border-t-0 border-black animate-slideDown shadow-lg">
        <p className="font-grotesque text-sm md:text-base leading-relaxed">
          {searchTerm ? (
            <span dangerouslySetInnerHTML={{
              __html: faq.answer.replace(
                new RegExp(`(${searchTerm})`, 'gi'),
                '<span class="search-highlight">$1</span>'
              )
            }} />
          ) : (
            <div
              className="faq-answer"
              dangerouslySetInnerHTML={{ __html: faq.answer }}
            />
          )}
        </p>
      </div>
    )}
  </div>
));

const FAQPage = () => {
  const [activeIndex, setActiveIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredFAQs, setFilteredFAQs] = useState(faqData);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isTyping, setIsTyping] = useState(false);

  // Define FAQ categories with emojis
  const categories = [
    { id: 'All', name: 'All', emoji: '' },
    { id: 'General Driving School Information', name: 'General Driving School Information', emoji: '🚗' },
    { id: 'Course & Training Details', name: 'Course & Training Details', emoji: '📘' },
    { id: 'Pricing, Payments & Refunds', name: 'Pricing, Payments & Refunds', emoji: '💰' },
    { id: 'Booking & Scheduling', name: 'Booking & Scheduling', emoji: '🗓️' },
    { id: 'License & Government Procedures', name: 'License & Government Procedures', emoji: '📝' },
    { id: 'Eligibility & Requirements', name: 'Eligibility & Requirements', emoji: '🔍' },
    { id: 'Safety & Vehicle Details', name: 'Safety & Vehicle Details', emoji: '🚘' },
    { id: 'Instructor-Related Questions', name: 'Instructor-Related Questions', emoji: '👨‍🏫' },
    { id: 'Corporate & Bulk Training', name: 'Corporate & Bulk Training', emoji: '🏢' },
    { id: 'Legal, Policies & Support', name: 'Legal, Policies & Support', emoji: '📜' },
  ];

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Filter FAQs based on search term and category
  useEffect(() => {
    let filtered = faqData;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(faq => faq.category === selectedCategory);
    }
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(faq =>
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredFAQs(filtered);
    setActiveIndex(null);
  }, [searchTerm, selectedCategory]);

  // Handle typing animation
  const handleInputChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    setIsTyping(true);
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  }, []);

  const toggleAccordion = useCallback((index) => {
    setActiveIndex(prev => (prev === index ? null : index));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setIsTyping(false);
  }, []);

  const handleCategoryChange = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
    setActiveIndex(null);
  }, []);

  return (
    <>
      <style jsx>{`
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px);}
    to { opacity: 1; transform: translateY(0);}
  }
  @keyframes slideDown {
    from { opacity: 0; max-height: 0; transform: translateY(-6px);}
    to { opacity: 1; max-height: 200px; transform: translateY(0);}
  }
  @keyframes bounce {
    0%, 20%, 53%, 80%, 100% { transform: translate3d(0,0,0);}
    40%, 43% { transform: translate3d(0, -6px, 0);}
    70% { transform: translate3d(0, -3px, 0);}
    90% { transform: translate3d(0, -1.5px, 0);}
  }
  @keyframes pulse {
    0% { opacity: 1;}
    50% { opacity: 0.7;}
    100% { opacity: 1;}
  }
  .animate-fadeIn { animation: fadeIn 0.15s cubic-bezier(.4,0,.2,1);}
  .animate-slideDown { animation: slideDown 0.18s cubic-bezier(.4,0,.2,1);}
  .animate-bounce-1 { animation: bounce 0.9s infinite; animation-delay: 0ms;}
  .animate-bounce-2 { animation: bounce 0.9s infinite; animation-delay: 120ms;}
  .animate-bounce-3 { animation: bounce 0.9s infinite; animation-delay: 240ms;}
  .typing-cursor { animation: pulse 0.9s infinite;}
  .search-highlight { background-color: #fef08a; padding: 2px 4px; border-radius: 4px; animation: pulse 1.2s infinite;}
  .category-button { transition: all 0.18s cubic-bezier(.4,0,.2,1); transform: scale(1);}
  .category-button:hover { transform: scale(1.04);}
  .category-button.active { transform: scale(1.015); box-shadow: 0 4px 12px rgba(0, 206, 132, 0.22);}
`}</style>


      <div className="bg-logoYellow">
        <Navbar2 backgroundColor='#FAF9E6' logo='./LANE_LOGO.svg' burgerMenu='/PurpleHamburger.png' />

        <div className='w-full min-h-screen pt-8 pb-24'>
          <div className="max-w-6xl mx-4 md:mx-auto bg-white rounded-[1rem] md:rounded-[2rem] p-4 md:p-8 shadow-lg">
            {/* Header with Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8 mt-4 md:mt-0">
              <h1 className="text-3xl md:text-4xl font-medium font-['glancyr'] text-center md:text-left" aria-description='Frequently Asked Questions'>
                Frequently Asked Questions
              </h1>
              <div className="relative w-full md:w-80 lg:w-96">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search FAQs..."
                    value={searchTerm}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 pr-12 border border-gray-300 rounded-[1rem] font-grotesque text-sm focus:outline-none focus:ring-2 focus:ring-[#00CE84] focus:border-transparent transition-all duration-300 ${isTyping ? 'animate-pulse border-[#00CE84]' : ''}`}
                  />
                  {isTyping && (
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex space-x-1">
                      <div className="w-1 h-1 bg-[#00CE84] rounded-full animate-bounce-1"></div>
                      <div className="w-1 h-1 bg-[#00CE84] rounded-full animate-bounce-2"></div>
                      <div className="w-1 h-1 bg-[#00CE84] rounded-full animate-bounce-3"></div>
                    </div>
                  )}
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                    {searchTerm ? (
                      <button
                        onClick={clearSearch}
                        className="text-gray-400 hover:text-gray-600 transition-colors transform hover:scale-110"
                        title="Clear search"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : (
                      <div className="relative">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <div className="absolute -right-2 top-1/2 transform -translate-y-1/2 w-0.5 h-4 bg-[#00CE84] typing-cursor"></div>
                      </div>
                    )}
                  </div>
                </div>
                {searchTerm && (
                  <div className="mt-2 text-right">
                    <p className="text-sm text-gray-600 font-grotesque animate-fadeIn">
                      {filteredFAQs.length} result{filteredFAQs.length !== 1 ? 's' : ''} found
                      {searchTerm && (
                        <span className="ml-1">
                          for "<span className="font-medium text-[#00CE84]">{searchTerm}</span>"
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Category Filter Buttons */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-3 justify-center">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryChange(category.id)}
                    className={`category-button px-4 py-2 rounded-full font-grotesque font-medium text-sm md:text-base transition-all duration-300 ${selectedCategory === category.id
                      ? category.id === 'All'
                        ? 'bg-yellow-200 text-black border-2 border-black active'
                        : category.id === 'General Driving School Information'
                          ? 'bg-green-200 text-black border-2 border-black active'
                          : category.id === 'Course & Training Details'
                            ? 'bg-purple-200 text-black border-2 border-black active'
                            : category.id === 'Pricing, Payments & Refunds'
                              ? 'bg-yellow-100 text-black border-2 border-black active'
                              : category.id === 'Booking & Scheduling'
                                ? 'bg-teal-200 text-black border-2 border-black active'
                                : 'bg-purple-100 text-black border-2 border-black active'
                      : category.id === 'All'
                        ? 'bg-yellow-100 text-black border border-gray-300 hover:bg-yellow-200'
                        : category.id === 'General Driving School Information'
                          ? 'bg-green-100 text-black border border-gray-300 hover:bg-green-200'
                          : category.id === 'Course & Training Details'
                            ? 'bg-purple-100 text-black border border-gray-300 hover:bg-purple-200'
                            : category.id === 'Pricing, Payments & Refunds'
                              ? 'bg-yellow-50 text-black border border-gray-300 hover:bg-yellow-100'
                              : category.id === 'Booking & Scheduling'
                                ? 'bg-teal-100 text-black border border-gray-300 hover:bg-teal-200'
                                : 'bg-purple-50 text-black border border-gray-300 hover:bg-purple-100'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      {category.emoji && <span>{category.emoji}</span>}
                      {category.extraEmoji && <span>{category.extraEmoji}</span>}
                      <span>{category.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Category Display */}
            {selectedCategory !== 'All' && (
              <div className="mb-6 text-center">
                <h2 className="text-xl md:text-2xl font-medium font-['glancyr'] text-gray-700">
                  {categories.find(cat => cat.id === selectedCategory)?.emoji} {selectedCategory} FAQs
                </h2>
              </div>
            )}

            {/* No Results Message */}
            {filteredFAQs.length === 0 && (searchTerm || selectedCategory !== 'All') && (
              <div className="text-center py-12 animate-fadeIn">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-gray-300 mx-auto animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium font-['glancyr'] text-gray-600 mb-2">
                  No FAQs found
                </h3>
                <p className="font-grotesque text-gray-500 mb-4">
                  {searchTerm
                    ? "Try adjusting your search terms or browse different categories."
                    : `No FAQs available in the ${selectedCategory} category yet.`
                  }
                </p>
                <button
                  onClick={() => {
                    clearSearch();
                    setSelectedCategory('All');
                  }}
                  className="bg-gradient-to-r from-[#00CE84] to-[#00BC78] text-white px-6 py-2 rounded-full font-grotesque font-medium hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                >
                  Show All FAQs
                </button>
              </div>
            )}

            {/* FAQ Grid */}
            {filteredFAQs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-fadeIn">
                {filteredFAQs.map((faq, idx) => (
                  <FAQItem
                    key={faq.id || faq.question}
                    faq={faq}
                    isActive={activeIndex === idx}
                    onClick={() => toggleAccordion(idx)}
                    searchTerm={searchTerm}
                  />
                ))}
              </div>
            )}

            {/* Sign Up Section */}
            <div className="mt-12 text-center p-6 bg-gray-50 rounded-[1rem] transform transition-all duration-300 hover:shadow-md">
              <h3 className="text-xl md:text-2xl font-medium font-['glancyr'] mb-3">
                For More Information
              </h3>
              <button
                onClick={() => window.location.href = '/signup'}
                className="bg-gradient-to-r from-[#00CE84] to-[#00BC78] text-white px-6 py-2 rounded-full font-grotesque font-medium hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

export default FAQPage;
