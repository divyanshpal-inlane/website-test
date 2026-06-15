import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const userReviews = [
  {
    name: "Sushmita Chakraborty",
    text: "I had an excellent experience learning with Suraj at Lane Driving Classes. He is extremely patient and thorough in covering every topic, which really helped me build confidence behind the wheel. Thanks to his clear explanations and supportive teaching style, I was able to start driving solo confidently after just 8 hours of sessions.",
    rating: 5,
  },
  {
    name: "anusha p",
    text: "The best driving in Bangalore i can say. Very well structured, class and technologically forward driving class you can find in bengaluru unlike other below average driving schools.",
    rating: 5,
  },
  {
    name: "Avnesh Shakya",
    text: "I had an overall good experience with Lane Driving School. Initially, my experience was not very smooth. The first coach assigned did not have a dual-pedal system in the car, which was uncomfortable for a beginner.",
    rating: 5,
  },
  {
    name: "Anjali N",
    text: "My instructor was Suraj. I had a great experience learning to drive. He taught all the essential skills clearly and made sure I built a strong foundation.He was always kind and calm in his communication.",
    rating: 5,
  },
  {
    name: "Shrinivas Mogare",
    text: "A big shoutout to Instructor Suraj Sir for his excellent teaching. He explained car dynamics in a very clear and practical way. I had previously learned from a few other instructors, but nothing comes close to his teaching style and depth of knowledge.",
    rating: 5,
  },
  {
    name: "neha sinha",
    text: "I must say that Lane Driving School is very trustworthy, punctual and here all can learn driving with confidence.. thier methods of teaching is awesome... I have learnt Driving from Janardhan Sir, a great Instructor...",
    rating: 5,
  },
  {
    name: "Mohammed Nauman",
    text: "I had a great experience with Lane Driving School. The team is professional, responsive, and always ready to answer queries. Their customer support is excellent, and they are very flexible with timings—rescheduling sessions was never an issue.",
    rating: 5,
  },
  {
    name: "Darshini Ravi",
    text: "I had a very good experience learning driving from Nanda Bhaiya. He is extremely patient, calm, and explains everything clearly, which makes learning very easy even for beginners.",
    rating: 5,
  },
  {
    name: "Naveen Ambati",
    text: "I was confused earlier about which driving school I should join. At that time, I came across LANE through social media advertisements, and it had very good reviews and ratings. So, I decided to join LANE.",
    rating: 5,
  },
  {
    name: "ajith kumar",
    text: "I had a really good experience learning driving with Girish. He is calm, patient, and explains things in a simple and easy-to-understand way. Each class was well organized, and he made sure I understood traffic rules and driving basics thoroughly.",
    rating: 5,
  },
  {
    name: "sudhanshu gupta",
    text: "Wayyy better than otheri driving schools. Very accommodating in taking classes with my busy schedule. Instructor Salman Sir helped me feel comfortable and confident on the road. The training was thorough and professional.",
    rating: 5,
  },
  {
    name: "Melvin Jenson",
    text: "I highly recommend Instructor Rizwan from Lane Driving School. He is extremely cooperative, calm, and friendly, which made learning very comfortable and stress-free. I was able to understand all the basic controls and driving fundamentals on the very first day itself.",
    rating: 5,
  },
  {
    name: "Shambhavi Jagadeesh",
    text: "A great experience overall and definitely better than other driving schools. They were very accommodating with my busy schedule. The training was thorough, and I felt confident on the road much sooner than I expected. Highly recommended for their professional approach and flexibility!",
    rating: 5,
  },
  {
    name: "Divya Austin",
    text: "My experience at Lane Driving School was highly positive.My instructor, Mr. Janardhana, demonstrated remarkable patience and a friendly, professional manner throughout my training. His instructions were consistently clear and easy to follow.",
    rating: 5,
  },
];

const fallbackVideos = [
  {
    id: 1,
    title: "Passed my driving test!",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  }, // Placeholders, replace with actual URLs
  {
    id: 2,
    title: "Great experience with Lane",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
  {
    id: 3,
    title: "Highly recommend!",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
  {
    id: 4,
    title: "Best driving school",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
];

const Reviews = () => {
  // const [videos, setVideos] = useState([]);
  // const [activeVideo, setActiveVideo] = useState(null);

  // const handleVideoClick = (vidId) => {
  //   setActiveVideo(vidId);
  //   // Smoothly scroll the clicked video card into the center of the viewport
  //   const card = document.getElementById(`video-card-${vidId}`);
  //   if (card) {
  //     card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  //   }
  // };

  // useEffect(() => {
  //   const fetchYouTubeVideos = async () => {
  //     // Use Vite env variable for API key
  //     const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
  //     const PLAYLIST_ID = "PLvOf-kiSW-NzvBr6aIU6JVKyiUY1gTbLm";
  //     const MAX_RESULTS = 15; // Set to 15 to fetch more videos for the slider

  //     if (!API_KEY) {
  //       setVideos(fallbackVideos);
  //       return;
  //     }

  //     const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_RESULTS}&playlistId=${PLAYLIST_ID}&key=${API_KEY}`;

  //     try {
  //       const response = await fetch(url);
  //       const data = await response.json();

  //       if (data.items && data.items.length > 0) {
  //         const fetchedVideos = data.items.map(item => ({
  //           id: item.snippet.resourceId.videoId,
  //           title: item.snippet.title,
  //           url: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`
  //         }));
  //         setVideos(fetchedVideos);
  //       } else {
  //         setVideos(fallbackVideos);
  //       }
  //     } catch (error) {
  //       console.error("Failed to load videos from YouTube", error);
  //       setVideos(fallbackVideos);
  //     }
  //   };

  //   fetchYouTubeVideos();
  // }, []);

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 pb-20">
      {/* Hero Section with Marquee */}
      <section className="pt-20 pb-10 bg-[#00CE84] overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight text-[#333333]">
            Wall of <span className="text-[#6C5CE7]">Trust</span> and{" "}
            <span className="text-[#6C5CE7]">Confidence</span>
          </h1>
          <div className="flex justify-center mb-6">
            <span className="bg-white text-[#00CE84] px-6 py-2 rounded-full font-bold text-lg shadow-sm border border-gray-100">
              4.8★ Average Rating | 35,000+ Registrations
            </span>
          </div>
          <p className="text-lg md:text-xl font-medium text-gray-800 max-w-2xl mx-auto mb-12">
            See what our students are saying about their journey to confident
            driving.
          </p>
        </div>

        {/* Marquee Animation */}
        <div className="relative flex overflow-x-hidden group py-4">
          <div className="animate-marquee whitespace-nowrap flex items-center space-x-6">
            {userReviews.map((review, idx) => (
              <span
                key={idx}
                className="bg-white text-[#6C5CE7] px-6 py-3 rounded-full shadow-sm text-lg font-semibold border border-gray-100"
              >
                ⭐ {review.text}
              </span>
            ))}
          </div>
          <div className="absolute top-0 animate-marquee2 whitespace-nowrap flex items-center space-x-6">
            {userReviews.map((review, idx) => (
              <span
                key={`dup-${idx}`}
                className="bg-white text-[#6C5CE7] px-6 py-3 rounded-full shadow-sm text-lg font-semibold border border-gray-100"
              >
                ⭐ {review.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Why Learners Trust Inlane
          </h2>
          <div className="flex justify-center">
            <div className="flex flex-col items-start space-y-4">
              {[
                "Updated 2026 RTO Question Bank",
                "Real Exam Pattern Practice Tests",
                "91% First-Attempt Success Rate",
                "Simple Traffic Sign Explanations",
                "Mobile-Friendly & Fast Results",
              ].map((item, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <span className="text-gray-800 text-xl font-bold">✓</span>
                  <span className="text-gray-800 font-medium text-lg">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Video Reviews Section */}
      {/* <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Real Students, Real Results</h2>
            <div className="w-24 h-1 bg-[#6C5CE7] mx-auto rounded"></div>
          </div>
          
          <div className="flex overflow-x-auto space-x-6 pb-8 snap-x snap-mandatory hide-scrollbar group p-4">
            {videos.map((vid) => (
              <div 
                key={vid.id} 
                id={`video-card-${vid.id}`}
                className="flex-shrink-0 w-[85vw] md:w-[450px] snap-center bg-white rounded-2xl p-4 shadow-xl hover:shadow-2xl transition-shadow duration-300 cursor-pointer"
              >
                <div 
                  className="bg-gray-200 rounded-xl overflow-hidden relative w-full group/vid"
                  style={{ paddingBottom: "56.25%" }}
                  onClick={() => handleVideoClick(vid.id)}
                >
                  {/* Invisible overlay catches clicks to trigger scrolling and injects autoplay immediately */}
      {/* {activeVideo !== vid.id && (
                    <div className="absolute inset-0 z-10 bg-transparent flex items-center justify-center group-hover/vid:bg-black/10 transition-colors">
                       <span className="bg-[#6C5CE7] text-white rounded-full p-4 transform scale-75 group-hover/vid:scale-100 transition-transform shadow-lg drop-shadow-md">
                         <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                       </span>
                    </div>
                  )}
                  <iframe 
                    className="absolute top-0 left-0 w-full h-full pointer-events-auto"
                    src={activeVideo === vid.id ? `${vid.url}?autoplay=1` : vid.url} 
                    title={vid.title}
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-progress" 
                    allowFullScreen>
                  </iframe>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>  */}

      {/* Chat / Text Reviews Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              What people are saying
            </h2>
            <div className="w-24 h-1 bg-[#00CE84] mx-auto rounded"></div>
          </div>

          <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
            {userReviews.map((review, idx) => (
              <div
                key={idx}
                className="break-inside-avoid bg-gray-50 border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#00CE84] to-[#6C5CE7] rounded-full flex items-center justify-center text-white font-bold text-xl uppercase">
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{review.name}</h4>
                    <div className="flex text-yellow-500 text-sm">
                      {"⭐".repeat(review.rating)}
                    </div>
                  </div>
                </div>
                <p className="text-gray-700 font-medium leading-relaxed text-lg">
                  "{review.text}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="py-16 bg-[#6C5CE7] text-white text-center mt-10">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to get your license?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join hundreds of confident drivers today.
          </p>
          <Link
            to="/courses"
            className="inline-block bg-[#00CE84] text-white font-bold text-lg px-8 py-4 rounded-full shadow-lg hover:scale-105 transition-transform"
          >
            View Driving Plans
          </Link>
        </div>
      </section>

      {/* Tailwind customizations for marquee (add to index.css if not already present) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes marquee2 {
          0% { transform: translateX(100%); }
          100% { transform: translateX(0%); }
        }
        .animate-marquee {
          animation: marquee 120s linear infinite;
        }
        .animate-marquee2 {
          animation: marquee2 120s linear infinite;
        }
      `,
        }}
      />
    </div>
  );
};

export default Reviews;
