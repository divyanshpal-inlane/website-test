import { createClient } from 'contentful'

const contentfulClient = createClient({
  space: "m7qe3du2pj2h",
  accessToken: "9B9TTpmwujLpTufPBXwU7FKpPpmmt-lpMTtsGvmzkVE",
})

export const getContentfulSeoData = async () => {
  try {
    const seoJsonData = await contentfulClient.getEntries({
      content_type: 'seoTagTemplate',
      limit: 10
    })
    
    // console.log('\n=== CONTENTFUL SEO TAG TEMPLATE DATA ===')
    // console.log('Full response:', JSON.stringify(seoJsonData, null, 2))
    // console.log('Items count:', seoJsonData.items.length)
    
    if (seoJsonData.items.length > 0) {
      // console.log('First item:', JSON.stringify(seoJsonData.items[0], null, 2))
      // console.log('First item fields:', seoJsonData.items[0].fields)
      // console.log('Available field keys:', Object.keys(seoJsonData.items[0].fields || {}))
    }    
    return seoJsonData.items[0]?.fields?.seoData || {}
  } catch (error) {
    console.error('Failed to fetch SEO data from Contentful:', error)
    // Return empty object as fallback
    return {}
  }
}

export const getLocationSEO = (location, contentfulSeoData = {}) => {
  const locationSlug = `/driving-school-in/${location.toLowerCase().replace(/\s+/g, '-')}`
  
  if (contentfulSeoData[locationSlug]) {
    return contentfulSeoData[locationSlug]
  }
  
  // Fallback to current logic
  return {
    title: `Best Driving School in ${location} | Lane Driving Lessons`,
    description: `Learn driving in ${location} with Lane. Professional instructors, flexible schedule, 10-hour comprehensive course. Book your driving lessons in ${location} today!`,
    keywords: `driving school ${location}, driving lessons ${location}, learn driving ${location}, driving instructor ${location}`,
    ogImage: '/LANE_LOGO.svg',
    canonical: `https://inlane.in/driving-school-in/${location.toLowerCase().replace(/\s+/g, '-')}`,
    ogTitle: `Best Driving School in ${location} | Lane Driving Lessons`,
    ogDescription: `Learn driving in ${location} with Lane. Professional instructors, flexible schedule, 10-hour comprehensive course. Book your driving lessons in ${location} today!`,
    ogURL: `https://inlane.in/driving-school-in/${location.toLowerCase().replace(/\s+/g, '-')}`,
    schema: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": `Lane Driving School - ${location}`,
      "description": `Professional driving lessons in ${location}`,
      "url": `https://inlane.in/driving-school-in/${location.toLowerCase().replace(/\s+/g, '-')}`,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": location,
        "addressCountry": "IN"
      }
    }
  }
}

export const getBlogSEO = (slug, title, description) => ({
  title: `${title} | Lane Driving Blog`,
  description: description || 'Expert driving tips and road safety advice from Lane Driving School.',
  keywords: 'driving tips, road safety, driving advice, lane blog',
  ogImage: '/LANE_LOGO.svg',
  canonical: `https://inlane.in/blog/${slug}`,
  ogTitle: `${title} | Lane Driving Blog`
})