import fs from 'fs'
import path from 'path'
import { getContentfulSeoData, getLocationSEO } from './src/utils/contentfulSeoData.js'
import { locations } from './src/data/locations.js'
import { rtoServices } from './src/data/rtoServicesData.js'
import { createClient } from 'contentful'

const contentfulClient = createClient({
  space: "m7qe3du2pj2h",
  accessToken: "9B9TTpmwujLpTufPBXwU7FKpPpmmt-lpMTtsGvmzkVE",
})

function generateSitemap(routes) {
  const baseUrl = 'https://inlane.in'
  const currentDate = new Date().toISOString().split('T')[0]
  
  const urlEntries = routes.map(route => {
    const url = route === '/' ? baseUrl : `${baseUrl}${route}`
    const priority = route === '/' ? '1.0' : route.startsWith('/blog/') ? '0.7' : '0.8'
    const changefreq = route.startsWith('/blog/') ? 'weekly' : 'monthly'
    
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  }).join('\n')
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

async function generatePages() {
  const template = fs.readFileSync('./dist/index.html', 'utf-8')
  let routes = {}
  // console.log('Fetching SEO data from Contentful...')
  const contentfulSeoData = await getContentfulSeoData()
  // console.log('Contentful SEO data received:', JSON.stringify(contentfulSeoData, null, 2))
  // console.log('Available SEO routes:', Object.keys(contentfulSeoData))
  Object.assign(routes, contentfulSeoData)
  // console.log('SEO data loaded from Contentful')

  locations.forEach(location => {
    const slug = location.toLowerCase().replace(/\s+/g, '-')
    routes[`/driving-school-in/${slug}`] = getLocationSEO(location, contentfulSeoData)
  })

  // Fetch blog posts from Contentful
  try {
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
        ogTitle: post.fields.seoTitle || post.fields.title,
        ogDescription: post.fields.seoDescription || post.fields.blogSummary?.content?.[0]?.content?.[0]?.value || post.fields.title,
        ogImage: '/LANE_LOGO.svg',
        ogURL: `https://inlane.in/blog/${slug}`,
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
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${seo.ogTitle || seo.title}"`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${seo.ogDescription || seo.description}"`)
    .replace(/<meta\s+property="og:image"\s+content="[^"]*"/, `<meta property="og:image" content="${seo.ogImage || '/LANE_LOGO.svg'}"`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"/, `<meta property="og:url" content="${seo.ogURL || seo.canonical}"`)
  
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
  // Generate sitemap
  const rtoRoutes = ['/rto-services', ...rtoServices.map(service => `/rto-services/${service.slug}`)]
  const sitemap = generateSitemap([...Object.keys(routes), ...rtoRoutes])
  fs.writeFileSync('./dist/sitemap.xml', sitemap)
  // console.log('Sitemap generated!')
  
  console.log(`\nPre-rendered ${Object.keys(routes).length} pages with SEO!`)
  Object.keys(routes).forEach(route => {
    const seo = routes[route]
    // console.log(`  ${route}:`)
    // console.log(`    Title: ${seo.title}`)
    // console.log(`    Schema: ${seo.schema ? 'YES' : 'NO'}`)
    // console.log(`    Canonical: ${seo.canonical}`)
  })
  // console.log('\n=== SEO VERIFICATION ===')
  // console.log(`Total routes: ${Object.keys(routes).length}`)
  // console.log(`Routes with schema: ${Object.values(routes).filter(r => r.schema).length}`)
  // console.log(`Sitemap entries: ${Object.keys(routes).length}`)
  // console.log('Sitemap generated at: ./dist/sitemap.xml')
}

generatePages()