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
    console.log('Fetching blog posts from Contentful...')
    const blogResponse = await contentfulClient.getEntries({
      content_type: 'blog',
      limit: 100
    })
    
    console.log(`Found ${blogResponse.items.length} blog posts`)
    
    blogResponse.items.forEach((post, index) => {
      let slug = post.fields.slug
      
      // If slug is a full URL, extract just the slug part
      if (slug && slug.includes('/')) {
        slug = slug.split('/').pop()
      }
      
      // If no slug or empty, generate from title
      if (!slug) {
        slug = post.fields.title
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      }
      console.log(`${index + 1}. Processing: "${post.fields.title}" -> /blog/${slug}`)
      
      routes[`/blog/${slug}`] = {
        title: post.fields.seoTitle || post.fields.title,
        description: post.fields.seoDescription || post.fields.blogSummary?.content?.[0]?.content?.[0]?.value || post.fields.title,
        keywords: post.fields.keywords || 'driving school, bangalore, blog',
        canonical: `https://inlane.in/blog/${slug}`,
        schema: post.fields.schemaSeo || null
      }
    })
    console.log('Blog posts processed successfully')
  } catch (error) {
    console.log('Could not fetch blog posts:', error.message)
    console.log('Error details:', error)
  }

  Object.entries(routes).forEach(([route, seo]) => {
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${seo.title}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"/, `<meta name="description" content="${seo.description}"`)
    .replace(/<meta\s+name="keywords"\s+content="[^"]*"/, `<meta name="keywords" content="${seo.keywords}"`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${seo.title}"`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${seo.description}"`)
  
  // Only update canonical if it exists 
  if (seo.canonical) {
    html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"/, `<link rel="canonical" href="${seo.canonical}"`)
  }
  // Add schema markup 
  if (seo.schema) {
    html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(seo.schema)}</script></head>`)
  }
  const dir = route === '/' ? './dist' : `./dist${route}`
  if (route !== '/') {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(`${dir}/index.html`, html)
  } else {
    fs.writeFileSync('./dist/index.html', html)
  }
  })

  console.log(`\nPre-rendered ${Object.keys(routes).length} pages with SEO!`)
  Object.keys(routes).forEach(route => {
    console.log(`  ${route}`)
  })
}

generatePages()