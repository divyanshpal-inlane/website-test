import fs from 'fs'
import path from 'path'
import { seoData, getLocationSEO } from './src/utils/seoData.js'
import { locations } from './src/data/locations.js'
import { createClient } from 'contentful'

const contentfulClient = createClient({
  space: "m7qe3du2pj2h",
  accessToken: "9B9TTpmwujLpTufPBXwU7FKpPpmmt-lpMTtsGvmzkVE",
})

async function generatePages() {
  const template = fs.readFileSync('./dist/index.html', 'utf-8')
  const routes = {
    '/': seoData['/'],
    '/about-us': seoData['/about-us'],
    '/courses': seoData['/courses'],
    '/faqs': seoData['/faqs'],
    '/blog': {
      title: 'Lane Journal - Driving Tips & Road Safety Blog',
      description: 'Expert driving tips, road safety guides, and latest updates from Lane Driving School. Learn everything about driving in Bangalore.',
      keywords: 'driving tips, road safety, driving blog, bangalore driving, lane journal',
      canonical: 'https://inlane.in/blog'
    }
  }

  locations.forEach(location => {
    const slug = location.toLowerCase().replace(/\s+/g, '-')
    routes[`/driving-school-in/${slug}`] = getLocationSEO(location)
  })

  // Fetch blog posts from Contentful
  try {
    const blogResponse = await contentfulClient.getEntries({
      content_type: 'blogPost',
      limit: 100
    })
    
    blogResponse.items.forEach(post => {
      const slug = post.fields.slug
      routes[`/blog/${slug}`] = {
        title: post.fields.title,
        description: post.fields.description || post.fields.title,
        keywords: post.fields.keywords || 'driving school, bangalore, blog',
        canonical: `https://inlane.in/blog/${slug}`
      }
    })
  } catch (error) {
    console.log('Could not fetch blog posts:', error.message)
  }

  Object.entries(routes).forEach(([route, seo]) => {
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${seo.title}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"/, `<meta name="description" content="${seo.description}"`)
    .replace(/<meta\s+name="keywords"\s+content="[^"]*"/, `<meta name="keywords" content="${seo.keywords}"`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${seo.title}"`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${seo.description}"`)
  
  // Only update canonical if it exists in seoData
  if (seo.canonical) {
    html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"/, `<link rel="canonical" href="${seo.canonical}"`)
  }
  const dir = route === '/' ? './dist' : `./dist${route}`
  if (route !== '/') {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(`${dir}/index.html`, html)
  } else {
    fs.writeFileSync('./dist/index.html', html)
  }
  })

  console.log('Pre-rendered pages with SEO!')
}

generatePages()