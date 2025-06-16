import React, { useState, useEffect, useCallback } from "react";
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createClient } from "contentful";
import { useNavigate } from "react-router-dom";
import { Helmet } from 'react-helmet-async';
import { Link } from "react-router-dom";
import { Button } from "@mui/material";

// Utility function to generate a URL-friendly slug
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .trim();                  // Trim leading/trailing hyphens
};

// Create client instance outside component to prevent re-creation
const contentfulClient = createClient({
  space: "m7qe3du2pj2h",
  accessToken: "9B9TTpmwujLpTufPBXwU7FKpPpmmt-lpMTtsGvmzkVE",
});

const Blog = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [contentTypes, setContentTypes] = useState([]);
  const [totalItems, setTotalItems] = useState(0);

  const content = "By Your Side, Every Ride 🚗 Every Ride 🚗 By Your Side,";

  const categories = [
    "All",
    "Everything Cars 🚗",
    "RTO Queries❓",
    "Driver's Circle 😊🛞",
    "Lane Updates 📧",
    "Road trips🛣️",
  ];
  const categoryBorderColors = {
    "Everything Cars 🚗": "border-[#00CE84] bg-[#00CE84]/25",
    "RTO Queries❓": "border-[#D1B3FF] bg-[#D1B3FF]/25",
    "Driver's Circle 😊🛞": "border-[#D9FF7A] bg-[#D9FF7A]/25",
    "Lane Updates 📧": "border-[#00CE84] bg-[#00CE84]/25",
    "Road trips🛣️": "border-[#D1B3FF] bg-[#D1B3FF]/25",
    All: "border-[#D9FF7A] bg-[#D9FF7A]/25",
  };

  const BlogColors = {
    "Everything Cars 🚗": "bg-[#00CE84]",
    "RTO Queries❓": "bg-[#D1B3FF]",
    "Driver's Circle 😊🛞": "bg-[#D9FF7A]",
    "Lane Updates 📧": "bg-[#00CE84]",
    "Road trips🛣️": "bg-[#D1B3FF]",
    All: "bg-[#D9FF7A]",
  };

  const postsPerPage = 6;
  const totalPages = Math.ceil(totalItems / postsPerPage);

  const brandColors = ["#00CE84", "#D1B3FF", "#D9FF7A"];

  // Helper function to get categories for a post
  const getPostCategories = (fields) => {
    const categoryMap = {
      everythingCars: "Everything Cars 🚗",
      rtoQueries: "RTO Queries❓",
      theNewDriversCircle: "Driver's Circle 😊🛞",
      laneUpdates: "Lane Updates 📧",
      roadTrips: "Road trips🛣️",
    };

    return Object.entries(categoryMap)
      .filter(([key]) => fields[key] === true)
      .map(([, value]) => value);
  };

  // Handler for blog post click
  const handleBlogClick = useCallback(
    (post) => {
      // Generate a slug from the post title
      const slug = generateSlug(post.title);
      navigate(`/blog/${slug}`, { 
        state: { 
          id: post.id,  // Pass the actual Contentful ID in state
          title: post.title 
        } 
      });
    },
    [navigate]
  );

  // Fetch content types only once on mount
  useEffect(() => {
    const fetchContentTypes = async () => {
      try {
        const response = await contentfulClient.getContentTypes();
        setContentTypes(response.items);
      } catch (error) {
        console.error("Error fetching content types:", error);
        setError(
          "Failed to load content structure. Please check your Contentful configuration."
        );
      }
    };

    fetchContentTypes();
  }, []);

  // Fetch posts when filters change
  useEffect(() => {
    let isActive = true;

    const fetchPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        let queryParams = {
          content_type: "blog",
          limit: postsPerPage,
          skip: (currentPage - 1) * postsPerPage,
        };

        // Add category filter if not "All"
        if (selectedCategory !== "All") {
          const categoryFieldMap = {
            "Everything Cars 🚗": "everythingCars",
            "RTO Queries❓": "rtoQueries",
            "The New Driver's Circle 😊🛞": "theNewDriversCircle",
            "Lane Updates 📧": "laneUpdates",
            "Road trips🛣️": "roadTrips",
          };

          const contentfulField = categoryFieldMap[selectedCategory];
          if (contentfulField) {
            queryParams[`fields.${contentfulField}`] = true;
          }
        }

        // Add search query if present
        if (searchQuery) {
          queryParams.query = searchQuery;
        }

        const response = await contentfulClient.getEntries(queryParams);

        const totalItems = response.total; // Get the total number of posts
        setTotalItems(totalItems); // Update the state

        if (!isActive) return;

        const transformedPosts = response.items.map((item) => {
          return {
            id: item.sys.id,
            title: item.fields.title || "Untitled",
            excerpt:
              item.fields.blogSummary?.content?.[0]?.content?.[0]?.value ||
              "No description available",
            categories: getPostCategories(item.fields),
            image: item.fields.image?.fields?.file?.url || null,
            contentType: item.sys.contentType.sys.id,
            miniBlog: item.fields.miniBlog || false,
          };
        });

        setPosts(transformedPosts);
      } catch (error) {
        if (!isActive) return;

        console.error("Error details:", error);
        setError("Failed to load blog posts. Please try again later.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(fetchPosts, 300);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [currentPage, selectedCategory, searchQuery]);

  const getCardBackground = (categories, index) => {
    // Get the row number and position
    const rowIndex = Math.floor(index / 3);
    const positionInRow = index % 3;
    
    // If it's the first item in a row, generate new random order for this row
    if (positionInRow === 0) {
      // Create a new shuffled array for this row
      window[`row${rowIndex}Colors`] = [...brandColors]
        .sort(() => Math.random() - 0.5);
    }
    
    // Use the stored shuffled colors for this row
    return `bg-[${window[`row${rowIndex}Colors`][positionInRow]}]`;
  };

  const handleCategoryChange = useCallback((category) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  }, []);

  const handleSearch = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">
          <h2 className="font-bold mb-2">Error Loading Posts</h2>
          <p>{error}</p>
        </div>
        {contentTypes.length > 0 && (
          <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg">
            <h3 className="font-bold mb-2">Available Content Types:</h3>
            <ul className="list-disc list-inside">
              {contentTypes.map((type) => (
                <li key={type.sys.id}>
                  {type.name} ({type.sys.id})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>InLane Blog - Driving Tips, Road Safety & Car Knowledge | InLane.in</title>
        <meta 
          name="description" 
          content="Explore InLane's blog for expert driving tips, road safety guides, RTO information, and driving updates. Learn from India's modern driving experts about safe and confident driving."
        />
        <meta 
          name="keywords" 
          content="driving tips, road safety blog, RTO guidelines, driving lessons blog, car knowledge, driving school blog, traffic rules india, driving tips bangalore"
        />
        {/* Essential meta tags */}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://inlane.in/blog" />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="InLane Blog - Driving Tips & Road Safety Guides" />
        <meta property="og:description" content="Expert driving tips, road safety guides, and car knowledge from India's modern driving school. Stay updated with the latest in driving education." />
        <meta property="og:url" content="https://inlane.in/blog" />
        <meta property="og:type" content="blog" />
      </Helmet>

      <div className="w-full overflow-hidden flex justify-center items-center w-full mt-28 mb-24">
        <div className="inline-flex whitespace-nowrap">
          {/* Primary scrolling container */}
          <div className="animate-scroll flex sm:gap-16 gap-10">
            {[...Array(7)].map((_, index) => (
              <span 
                key={index} 
                className="text-7xl md:text-7xl lg:text-8xl xl:text-9xl font-semibold text-[#00CE84]"
              >
                By Your Side, Every Ride 🚗
              </span>
            ))}
          </div>
        </div>
        <style>{`
          .animate-scroll {
            animation: scroll 60s linear infinite;
          }

          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-50%);
            }
          }

          /* Ensure smooth animation */
          @media (prefers-reduced-motion: no-preference) {
            .animate-scroll {
              animation-play-state: running;
            }
          }
        `}</style>
      </div>

      <div className="container mx-auto px-4 py-8 min-w-[320px] flex flex-col justify-center items-center">
        {/* <h1 className="text-5xl font-semibold p-4 mb-8 text-start text-[#00CE84] sm:hidden block">
          By Your Side
          <br />
          Every Ride 🚗
        </h1> */}

        <div className="relative mb-6 mx-auto w-full md:w-1/2 max-w-4xl">
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-16 pr-4 sm:py-2 border placeholder:text-2xl border-gray-300 bg-[#D1B3FF] opacity-50 rounded-full focus:outline-none focus:ring-2 focus:ring-[#D1B3FF] placeholder:font-blog placeholder:font-semibold h-[60px] placeholder:pl-6 placeholder:text-black text-xl"
            value={searchQuery}
            onChange={handleSearch}
          />
          <SearchIcon
            className="absolute left-1.5 top-1/2 transform -translate-y-1/2 text-white bg-[#B28fff] p-2 rounded-full"
            size={48}
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-10 sm:mb-12 justify-center items-center mt-4 sm:mt-8">
          <div className="max-w-3xl flex flex-wrap sm:gap-4 justify-center">
            {categories.map((category) => (
              <button
                key={category}
                className={`px-4 sm:py-3 py-1.5 rounded-full font-blog sm:text-2xl text-md font-medium transition-colors border m-1 ${
                  categoryBorderColors[category]
                } ${
                  selectedCategory === category
                    ? "!bg-[#D9FF7A] text-gray-700"
                    : "hover:bg-gray-100"
                }`}
                onClick={() => handleCategoryChange(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[600px] relative mb-8">
          {loading && (
            <div className="absolute inset-0 bg-opacity-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          )}

          {!loading && posts.length === 0 ? (
            <div className="text-center text-gray-600 py-12">
              <p className="text-xl">
                {selectedCategory !== "All"
                  ? `No blogs found in the "${selectedCategory}" category.`
                  : searchQuery
                  ? `No blogs found matching "${searchQuery}".`
                  : "No blog posts found."}
              </p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12 gap-12 mb-8 font-blog max-w-7xl mx-auto px-8">
                {posts.map((post, index) => (
                  <div
                    key={post.id}
                    className={`rounded-3xl shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${getCardBackground(
                      post.categories,
                      index
                    )}`}
                    onClick={() => handleBlogClick(post)}
                  >
                    <div className="aspect-square">
                      {post.image ? (
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-full object-cover p-4 rounded-3xl"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <span className="text-gray-400">
                            No image available
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-4 pt-0">
                      <h2 className="text-xl font-semibold mb-2 hover:text-white transition-colors mt-">
                        {post.title}
                      </h2>
                      <p className="text-gray-800 mb-4 line-clamp-2">
                        {post.excerpt}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {post.categories.map((category) => (
                          <span
                            key={category}
                            className="inline-block bg-white shadow-md rounded-full px-3 py-1 text-sm font-semibold text-gray-700"
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                      {post.miniBlog && (
                        <span className="inline-block bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-semibold">
                          Mini Blog
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {posts.length > 0 && (
          <div className="flex justify-center items-center space-x-4 mb-16 md:mb-24">
            <button
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeftIcon size={24} />
            </button>
            <span className="text-xl font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={loading || currentPage === totalPages}
            >
              <ChevronRightIcon size={24} />
            </button>
        </div>
          
        )}
        <Link
          to="/signup"
          className="inline-flex items-center justify-center ms-3  md:w-auto px-6 md:px-8 py-2 text-lg md:text-xl mb-16 shadow-xl font-extrabold text-white font-['Bricolage Grotesque'] 
                  rounded-full border-2 border-white bg-gradient-to-r from-[#00CE84] to-[#00BC78] hover:from-[#00CE84] hover:to-[#00CE84] transition-colors duration-200 "
        >
          <img src="/course/rocket.svg" alt="rocket" className="w-5 md:w-5 h-5 md:h-5 mr-2" />
          Sign Up
        </Link>
      </div>
    </>
  );
};

export default Blog;