import fs from 'fs'
import path from 'path'
import { seoData, getLocationSEO } from './src/utils/seoData.js'

const template = fs.readFileSync('./dist/index.html', 'utf-8')
const routes = {
  '/': seoData['/'],
  '/about-us': seoData['/about-us'],
  '/courses': seoData['/courses'],
  '/faqs': seoData['/faqs'],
  '/driving-school-in/hsr-layout': getLocationSEO('HSR Layout'),
  '/driving-school-in/tc-palya': getLocationSEO('TC Palya'),
  '/driving-school-in/itpl': getLocationSEO('ITPL'),
  '/driving-school-in/kr-puram': getLocationSEO('KR Puram')
}

Object.entries(routes).forEach(([route, seo]) => {
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${seo.title}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"/, `<meta name="description" content="${seo.description}"`)
    .replace(/<meta\s+name="keywords"\s+content="[^"]*"/, `<meta name="keywords" content="${seo.keywords}"`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${seo.title}"`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${seo.description}"`)
  
  const dir = route === '/' ? './dist' : `./dist${route}`
  if (route !== '/') {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(`${dir}/index.html`, html)
  } else {
    fs.writeFileSync('./dist/index.html', html)
  }
})

console.log('Pre-rendered pages with SEO!')