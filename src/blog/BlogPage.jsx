import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { createClient } from "contentful";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { BLOCKS, INLINES, MARKS } from "@contentful/rich-text-types";
import MyButton from "../ui/button/MyButton";

// Utility function to generate a URL-friendly slug
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .trim();                  // Trim leading/trailing hyphens
};

const contentfulClient = createClient({
  space: "m7qe3du2pj2h",
  accessToken: "9B9TTpmwujLpTufPBXwU7FKpPpmmt-lpMTtsGvmzkVE",
});

const RichTextContent = ({ node, isActive, links }) => {
  if (!node) return null;

  // Create asset and entry maps for rich text rendering
  const assetMap = new Map();
  const entryMap = new Map();

  // Helper function to safely get nested properties
  const getNestedValue = (obj, path) => {
    return path.reduce((acc, part) => acc && acc[part], obj);
  };

  // Process assets from different possible locations in the response
  const processAssets = (assets) => {
    if (!assets) return;

    // Handle array of assets
    if (Array.isArray(assets)) {
      assets.forEach((asset) => {
        if (asset.sys?.id) {
          assetMap.set(asset.sys.id, asset);
        }
      });
    }
    // Handle block assets
    else if (assets.block) {
      assets.block.forEach((asset) => {
        if (asset.sys?.id) {
          assetMap.set(asset.sys.id, asset);
        }
      });
    }
  };

  // Process entries from different possible locations in the response
  const processEntries = (entries) => {
    if (!entries) return;

    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        if (entry.sys?.id) {
          entryMap.set(entry.sys.id, entry);
        }
      });
    } else if (entries.block) {
      entries.block.forEach((entry) => {
        if (entry.sys?.id) {
          entryMap.set(entry.sys.id, entry);
        }
      });
    }
  };

  // Process all possible locations of assets and entries
  if (links) {
    processAssets(links.assets);
    processEntries(links.entries);
  }

  // Helper function to handle embedded asset data structure
  const processEmbeddedAsset = (node) => {
    // Handle direct node structure
    if (node.data?.target?.fields) {
      return {
        url: node.data.target.fields.file?.url,
        title: node.data.target.fields.title,
        description: node.data.target.fields.description,
        contentType: node.data.target.fields.file?.contentType,
      };
    }

    // Handle linked asset structure
    const targetId = node.data?.target?.sys?.id;
    if (targetId) {
      const asset = assetMap.get(targetId);
      if (asset?.fields) {
        return {
          url: asset.fields.file?.url,
          title: asset.fields.title,
          description: asset.fields.description,
          contentType: asset.fields.file?.contentType,
        };
      }
    }

    return null;
  };

  const renderOptions = {
    renderMark: {
      [MARKS.BOLD]: (text) => <strong>{text}</strong>,
      [MARKS.ITALIC]: (text) => <em>{text}</em>,
      [MARKS.UNDERLINE]: (text) => <u>{text}</u>,
      [MARKS.CODE]: (text) => (
        <code className="bg-gray-100 rounded px-1 py-0.5 font-mono text-sm">
          {text}
        </code>
      ),
    },
    renderNode: {
      [BLOCKS.HEADING_1]: (node, children) => (
        <div
          className="flex items-center mb-6 subtitle"
          id={`heading-${children[0]}`}
        >
          {/* <div className="w-16 h-16 flex-shrink-0">
            <img
              src={isActive ? "/GreenLight.svg" : "/RedLight.png"}
              alt="Section indicator"
              className="w-full h-full object-contain"
            />
          </div> */}
          <h1 className="text-5xl font-semibold ml-4">{children}</h1>
        </div>
      ),
      [BLOCKS.HEADING_2]: (node, children) => (
        <div
          className="flex items-center mb-6 mt-14 subtitle"
          id={`heading-${children[0]}`}
        >
          {/* <div className="w-16 h-16 flex-shrink-0">
            <img
              src={isActive ? "/GreenLight.svg" : "/RedLight.png"}
              alt="Section indicator"
              className="w-full h-full object-contain mt-2"
            />
          </div> */}
          <h2 className="text-4xl font-semibold">{children}</h2>
        </div>
      ),
      [BLOCKS.HEADING_3]: (node, children) => (
        <div
          className="flex items-center mb-4 mt-12 subtitle"
          id={`heading-${children[0]}`}
        >
          <h2 className="text-3xl font-semibold">{children}</h2>
        </div>
      ),
      [BLOCKS.HEADING_4]: (node, children) => (
        <div
          className="flex items-center mb-2 subtitle"
          id={`heading-${children[0]}`}
        >
          <h2 className="text-2xl font-semibold">{children}</h2>
        </div>
      ),
      [BLOCKS.HEADING_5]: (node, children) => (
        <div
          className="flex items-center mb-6 subtitle"
          id={`heading-${children[0]}`}
        >
          <h2 className="text-xl font-semibold">{children}</h2>
        </div>
      ),
      [BLOCKS.HEADING_6]: (node, children) => (
        <div
          className="flex items-center mb-6 subtitle"
          id={`heading-${children[0]}`}
        >
          <h2 className="text-xl font-semibold">{children}</h2>
        </div>
      ),
      [BLOCKS.PARAGRAPH]: (node, children) => {
        // Get the parent node type
        const parentNodeType = node?.parent?.nodeType;

        // If parent is a list-item, use mb-2, otherwise use mb-4
        const marginClass = parentNodeType === "list-item" ? "mb-2" : "mb-4";

        return <p className={`text-lg ${marginClass}`}>{children}</p>;
      },
      [BLOCKS.UL_LIST]: (node, children) => (
        <ul className="list-disc pl-6 mb-4 text-lg">{children}</ul>
      ),
      [BLOCKS.OL_LIST]: (node, children) => (
        <ol className="list-decimal pl-6 mb-4 text-lg">{children}</ol>
      ),
      [BLOCKS.LIST_ITEM]: (node, children) => {
        // Modify the children to adjust paragraph margins
        const modifiedChildren = React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === "p") {
            return React.cloneElement(child, {
              className: "text-lg mb-0.5",
            });
          }
          return child;
        });

        return <li className="pl-2">{modifiedChildren}</li>;
      },
      [BLOCKS.QUOTE]: (node, children) => (
        <blockquote className="border-l-4 border-gray-300 pl-4 my-4 italic">
          {children}
        </blockquote>
      ),
      [BLOCKS.HR]: () => <hr className="my-8 border-gray-300" />,
      [BLOCKS.EMBEDDED_ASSET]: (node) => {
        const asset = processEmbeddedAsset(node);
        if (!asset) return null;

        const { url, title, description, contentType } = asset;
        if (!url) return null;

        // Ensure URL has protocol
        const fullUrl = url.startsWith("//") ? `https:${url}` : url;

        if (contentType?.includes("image")) {
          return (
            <div className="my-6 flex flex-col justify-center">
              <img
                src={fullUrl}
                alt={title || "Blog image"}
                className="rounded-lg max-w-full h-auto max-h-96 w-full object-cover"
                loading="lazy"
              />
              {description && (
                <p className="text-sm text-gray-600 mt-2">{description}</p>
              )}
            </div>
          );
        } else if (contentType?.includes("video")) {
          return (
            <div className="my-6">
              <video
                controls
                className="rounded-lg max-w-full"
                title={title}
                preload="metadata"
              >
                <source src={fullUrl} type={contentType} />
                Your browser does not support the video tag.
              </video>
              {description && (
                <p className="text-sm text-gray-600 mt-2">{description}</p>
              )}
            </div>
          );
        }

        return null;
      },
      [INLINES.HYPERLINK]: (node, children) => (
        <a
          href={node.data.uri}
          className="text-blue-600 hover:text-blue-800 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
    },
  };

  return documentToReactComponents(node, renderOptions);
};

export default function BlogPost() {
  const { slug } = useParams();
  const location = useLocation();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubtitles, setActiveSubtitles] = useState({});

  useEffect(() => {
    const fetchBlogPost = async () => {
      try {
        setLoading(true);
        
        // First, try to use the ID passed in location state
        let postId = location.state?.id;

        // If no ID in state, fetch the post by searching for the matching slug
        if (!postId) {
          // Fetch all blog posts and find the one with a matching slug
          const response = await contentfulClient.getEntries({
            content_type: 'blog',
            'fields.title[match]': location.state?.title || '',
          });

          // Find the post where the generated slug matches the URL slug
          const matchingPost = response.items.find(
            item => generateSlug(item.fields.title) === slug
          );

          if (!matchingPost) {
            throw new Error('Blog post not found');
          }

          postId = matchingPost.sys.id;
        }

        // Fetch the specific entry
        const entry = await contentfulClient.getEntry(postId, {
          include: 10, // Include linked entries and assets
        });

        setPost(entry);
      } catch (err) {
        console.error("Error fetching blog post:", err);
        setError("Failed to load blog post. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchBlogPost();
    }
  }, [slug, location.state]);

  useEffect(() => {
    if (!post) return;

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        const elementRect = entry.target.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const elementMiddle = elementRect.top + elementRect.height / 2;

        setActiveSubtitles((prev) => ({
          ...prev,
          [entry.target.id]: elementMiddle < viewportHeight / 2,
        }));
      });
    };

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "-50% 0px",
      threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    });

    const scrollHandler = () => {
      document.querySelectorAll(".subtitle").forEach((subtitle) => {
        const rect = subtitle.getBoundingClientRect();
        const elementMiddle = rect.top + rect.height / 2;
        const viewportMiddle = window.innerHeight / 2;

        setActiveSubtitles((prev) => ({
          ...prev,
          [subtitle.id]: elementMiddle < viewportMiddle,
        }));
      });
    };

    document.querySelectorAll(".subtitle").forEach((subtitle) => {
      observer.observe(subtitle);
    });

    window.addEventListener("scroll", scrollHandler, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scrollHandler);
    };
  }, [post]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-100 text-red-700 p-4 rounded-lg">
          <h2 className="font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Blog post not found</div>
      </div>
    );
  }

  const { fields } = post;

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-center items-center mb-24 font-blog">
      {/* Banner Image */}
      <div className="flex justify-center items-center md:mt-16 mt-14 md:mb-8 mb-2 max-w-6xl mx-4">
        <div className="h-64 md:h-96">
          {fields.image?.fields?.file?.url ? (
            <img
              src={fields.image.fields.file.url}
              alt={fields.title}
              className="w-full h-full object-cover rounded-3xl"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 rounded-3xl flex items-center justify-center">
              <span className="text-gray-400">No image available</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row">
          {/* Left Space */}
          <div className="hidden md:block md:w-1/6 mr-4">
            <div className="top-4">
              <img
                className="h-64 w-full"
                src="/TrafficLight.svg"
                alt="Traffic Light"
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Title */}
            <h1 className="text-4xl font-bold mb-4">{fields.title}</h1>

            {/* Summary */}
            {/* <div className="text-lg mb-8">
              {documentToReactComponents(fields.blogSummary)}
            </div> */}

            {/* Blog Content */}
            <div className="blog-content">
              {fields.blogContent?.content?.map((node, index) => (
                <div key={index} className="blog-section">
                  <RichTextContent
                    node={node}
                    isActive={
                      activeSubtitles[`heading-${node.content?.[0]?.value}`]
                    }
                    links={fields.blogContent.links}
                  />
                </div>
              ))}
            </div>

            {/* Categories */}
            <div className="flex flex-wrap gap-2 mt-12">
              {fields.miniBlog && (
                <span className="inline-block bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-semibold">
                  Mini Blog
                </span>
              )}
              {fields.everythingCars && (
                <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">
                  Everything Cars 🚗
                </span>
              )}
              {fields.roadTrips && (
                <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">
                  Road trips🛣️
                </span>
              )}
              {fields.theNewDriversCircle && (
                <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">
                  The New Driver's Circle 😊🛞
                </span>
              )}
              {fields.laneUpdates && (
                <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">
                  Lane Updates 📧
                </span>
              )}
              {fields.rtoQueries && (
                <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">
                  RTO Queries❓
                </span>
              )}

              
            </div>
            {/* Signup Btn */}
            <div className="flex justify-center mt-12">
              <MyButton />
            </div>
          </div>

          {/* Right Space */}
          <div className="hidden md:block md:w-1/6 ml-4 mt-32">
            <div className="sticky top-4 h-full flex flex-col justify-end">
              <div className="w-full h-32 rounded-lg">
                <img src="/RoadBlocks.svg" alt="Road Blocks" />
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}