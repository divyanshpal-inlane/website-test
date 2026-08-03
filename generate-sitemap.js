import fs from 'fs'
import { seoData, getLocationSEO } from './src/utils/seoData.js'
import { rtoServices } from './src/data/rtoServicesData.js'

const baseUrl = 'https://inlane.in'
const locations = ['hsr-layout', 'tc-palya', 'itpl', 'kr-puram']

const generateSitemap = () => {
  const staticPages = Object.keys(seoData).map(path => ({
    url: `${baseUrl}${path}`,
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: path === '/' ? '1.0' : '0.8'
  }))

  const locationPages = locations.map(location => ({
    url: `${baseUrl}/driving-school-in/${location}`,
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.7'
  }))

  const rtoPages = [
    {
      url: `${baseUrl}/rto-services`,
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: '0.8'
    },
    ...rtoServices.map(service => ({
      url: `${baseUrl}/rto-services/${service.slug}`,
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: '0.7'
    }))
  ]

  const allPages = [...staticPages, ...locationPages, ...rtoPages]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  fs.writeFileSync('./public/sitemap.xml', sitemap)
  console.log('Sitemap generated successfully!')
}

generateSitemap()