export const updatePageMeta = (seoData) => {
  const { title, description, keywords, ogImage, canonical, ogTitle } = seoData;
  
  if (title) {
    document.title = title;
  }
  
  const updateMeta = (selector, content) => {
    if (!content) return;
    let meta = document.querySelector(selector);
    if (meta) {
      meta.setAttribute('content', content);
    } else {
      meta = document.createElement('meta');
      if (selector.includes('property=')) {
        meta.setAttribute('property', selector.match(/property="([^"]*)"/)[1]);
      } else {
        meta.name = selector.match(/name="([^"]*)"/)[1];
      }
      meta.content = content;
      document.head.appendChild(meta);
    }
  };
  
  updateMeta('meta[name="description"]', description);
  updateMeta('meta[name="keywords"]', keywords);
  updateMeta('meta[property="og:title"]', ogTitle || title);
  updateMeta('meta[property="og:description"]', description);
  updateMeta('meta[property="og:image"]', ogImage?.startsWith('http') ? ogImage : `https://inlane.in${ogImage}`);
  
  // Update canonical URL
  const canonicalUrl = canonical || `https://inlane.in${window.location.pathname}`;
  
  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) {
    canonicalLink.setAttribute('href', canonicalUrl);
  } else {
    canonicalLink = document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    canonicalLink.setAttribute('href', canonicalUrl);
    document.head.appendChild(canonicalLink);
  }
  
  console.log('Updated canonical to:', canonicalUrl);
}