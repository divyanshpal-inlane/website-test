export const updatePageMeta = (title, description, keywords, ogImage, canonical) => {
  // Update document title
  document.title = title;
  
  // Update meta description
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  } else {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = description;
    document.head.appendChild(meta);
  }
  
  // Update meta keywords
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    metaKeywords.setAttribute('content', keywords);
  } else {
    const meta = document.createElement('meta');
    meta.name = 'keywords';
    meta.content = keywords;
    document.head.appendChild(meta);
  }
  
  // Update Open Graph title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    ogTitle.setAttribute('content', title);
  } else {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.content = title;
    document.head.appendChild(meta);
  }
  
  // Update Open Graph description
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) {
    ogDescription.setAttribute('content', description);
  } else {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:description');
    meta.content = description;
    document.head.appendChild(meta);
  }
  
  // Update Open Graph image
  if (ogImage) {
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) {
      ogImg.setAttribute('content', `https://inlane.in${ogImage}`);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:image');
      meta.content = `https://inlane.in${ogImage}`;
      document.head.appendChild(meta);
    }
  }
  
  // Update canonical URL
  if (canonical) {
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', `https://inlane.in${canonical}`);
    } else {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = `https://inlane.in${canonical}`;
      document.head.appendChild(link);
    }
  }
}