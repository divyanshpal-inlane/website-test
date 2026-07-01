// Post-build pass that bakes the JS-rendered DOM into the static HTML files so
// that crawlers (and SEO tools) can read the H1/H2/body content from the page
// source instead of only seeing an empty <div id="root"></div>.
//
// It serves the freshly built ./dist over a throwaway localhost server, loads
// each prerendered route in headless Chrome, waits for React to render, then
// writes the captured #root markup back into that route's index.html.
//
// The whole pass is best-effort: if Chromium can't launch (e.g. on a build
// host without the required libraries) it logs a warning and leaves the
// meta-only HTML untouched, so a deploy can never be broken by snapshotting.

import fs from 'fs'
import path from 'path'
import http from 'http'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.map': 'application/json',
}

// Third-party tracking/analytics is aborted during snapshotting: it keeps the
// network busy (so "networkidle" never fires), slows the build, and would fire
// bogus pageview events from the build machine.
const BLOCKED_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'connect.facebook.net',
  'facebook.com',
  'sc-static.net',
  'snapchat.com',
  'doubleclick.net',
  'clarity.ms',
]

// puppeteer-core ships no browser, so locally we drive a real installed Chrome.
// PUPPETEER_EXECUTABLE_PATH wins; otherwise probe the usual install locations.
const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

function findChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return undefined // no local Chrome found; caller throws → meta-only fallback
}

function startStaticServer(root) {
  const absRoot = path.resolve(root)
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
        let filePath = path.join(absRoot, urlPath)

        // Keep the request inside the dist root (both paths are absolute).
        if (!filePath.startsWith(absRoot)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html')
        }

        if (!fs.existsSync(filePath)) {
          // A missing asset (has an extension) is a real 404; any other path is
          // an SPA route, so fall back to the root shell.
          if (path.extname(urlPath)) {
            res.writeHead(404)
            res.end('Not found')
            return
          }
          filePath = path.join(absRoot, 'index.html')
        }

        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        fs.createReadStream(filePath).pipe(res)
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function snapshotRoute(browser, baseUrl, route, distDir) {
  const filePath =
    route === '/' ? path.join(distDir, 'index.html') : path.join(distDir, route, 'index.html')

  if (!fs.existsSync(filePath)) return { route, status: 'skipped (no file)' }

  const page = await browser.newPage()
  try {
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const url = req.url()
      if (BLOCKED_HOSTS.some((h) => url.includes(h))) req.abort().catch(() => {})
      else req.continue().catch(() => {})
    })

    const target = baseUrl + (route === '/' ? '/' : route)
    await page
      .goto(target, { waitUntil: 'networkidle0', timeout: 30000 })
      .catch(() => {})

    // Wait until React has actually rendered meaningful content into #root
    // (covers blog pages that render their <h1> only after a Contentful fetch).
    await page
      .waitForFunction(
        () => {
          const r = document.getElementById('root')
          if (!r) return false
          if (r.querySelector('h1')) return true
          return (r.innerText || '').trim().length > 200
        },
        { timeout: 15000 },
      )
      .catch(() => {})

    // Small settle for any late, post-fetch content.
    await new Promise((r) => setTimeout(r, 600))

    const rootHtml = await page.evaluate(() => {
      const r = document.getElementById('root')
      if (!r) return ''
      // Drop large decorative inline SVGs from the static snapshot. They carry no
      // crawlable text, re-render when the app hydrates, and would otherwise bloat
      // the HTML source by megabytes (e.g. the homepage hero illustration).
      r.querySelectorAll('svg').forEach((svg) => {
        if (svg.outerHTML.length > 20000) {
          const ph = document.createElement('span')
          ph.setAttribute('data-stripped-svg', '')
          svg.replaceWith(ph)
        }
      })
      return r.innerHTML
    })

    if (!rootHtml || rootHtml.trim().length === 0) {
      return { route, status: 'empty (left meta-only)' }
    }

    const file = fs.readFileSync(filePath, 'utf-8')
    const marker = '<div id="root"></div>'
    if (!file.includes(marker)) {
      return { route, status: 'no root marker (skipped)' }
    }
    // Function replacement avoids special handling of $-sequences in the markup.
    const out = file.replace(
      marker,
      () => `<div id="root" data-prerendered="true">${rootHtml}</div>`,
    )
    fs.writeFileSync(filePath, out)
    return { route, status: 'ok', bytes: rootHtml.length }
  } catch (err) {
    return { route, status: `error: ${err.message}` }
  } finally {
    await page.close().catch(() => {})
  }
}

// Simple bounded-concurrency runner.
async function runPool(items, limit, worker) {
  const results = []
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return results
}

// Launch headless Chrome across environments using puppeteer-core (which has no
// bundled Chromium and no install build step):
//  - Vercel / AWS Lambda build: drive @sparticuz/chromium, a Chromium built with
//    the shared libraries those sandboxes otherwise lack.
//  - Local / CI: drive the system Chrome (or PUPPETEER_EXECUTABLE_PATH).
// Throws if no browser can be launched; the caller treats that as a soft failure
// and ships the meta-only HTML.
async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default
    const executablePath = await chromium.executablePath()
    console.log(`Launching @sparticuz/chromium (${executablePath})`)
    return await puppeteer.launch({
      args: [...chromium.args, '--disable-dev-shm-usage'],
      executablePath,
      headless: chromium.headless ?? true,
    })
  }

  const executablePath = findChromeExecutable()
  if (!executablePath) {
    throw new Error(
      'No local Chrome found. Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.',
    )
  }
  console.log(`Launching Chrome (${executablePath})`)
  return await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

/**
 * Bake rendered DOM into the static HTML for each route.
 * @param {string} distDir absolute or relative path to the build output dir
 * @param {string[]} routes route paths, e.g. ['/', '/blog/foo', ...]
 */
export async function snapshotRoutes(distDir, routes) {
  if (process.env.SKIP_SNAPSHOT === '1' || process.env.SKIP_SNAPSHOT === 'true') {
    console.log('Snapshot pass skipped (SKIP_SNAPSHOT set). HTML stays meta-only.')
    return
  }

  let server
  let browser
  try {
    server = await startStaticServer(distDir)
    const { port } = server.address()
    const baseUrl = `http://127.0.0.1:${port}`

    browser = await launchBrowser()

    console.log(`\nSnapshotting ${routes.length} routes into static HTML...`)
    const results = await runPool(routes, 4, (route) =>
      snapshotRoute(browser, baseUrl, route, distDir),
    )

    const ok = results.filter((r) => r && r.status === 'ok').length
    console.log(`Snapshot complete: ${ok}/${routes.length} routes baked with rendered content.`)
    results
      .filter((r) => r && r.status !== 'ok')
      .forEach((r) => console.log(`  - ${r.route}: ${r.status}`))
  } catch (err) {
    // Graceful fallback: leave the meta-only HTML as-is so the build still ships.
    console.warn('⚠️  Content snapshot pass failed — keeping meta-only HTML.')
    console.warn('   Reason:', err.message)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (server) server.close()
  }
}
