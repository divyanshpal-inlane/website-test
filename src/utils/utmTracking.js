const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];
const FIRST_TOUCH_KEY = "utm_first_touch";
const LAST_TOUCH_KEY = "utm_last_touch";

/**
 * Detect channel from document.referrer when no UTMs are present in URL.
 * Returns null if user came directly (no referrer) AND we should treat as direct.
 */
function detectFromReferrer() {
  const referrer = document.referrer;
  if (!referrer) {
    return {
      utm_source: "direct",
      utm_medium: "none",
      utm_campaign: "direct",
    };
  }
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    // Don't attribute self-referrals
    if (host.includes(window.location.hostname)) return null;

    if (host.includes("google"))
      return {
        utm_source: "google",
        utm_medium: "organic",
        utm_campaign: "seo",
      };
    if (host.includes("facebook") || host.includes("fb.com"))
      return {
        utm_source: "facebook",
        utm_medium: "social",
        utm_campaign: "organic",
      };
    if (host.includes("instagram"))
      return {
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "organic",
      };
    if (host.includes("linkedin"))
      return {
        utm_source: "linkedin",
        utm_medium: "social",
        utm_campaign: "organic",
      };
    if (
      host.includes("twitter") ||
      host.includes("t.co") ||
      host.includes("x.com")
    ) {
      return {
        utm_source: "twitter",
        utm_medium: "social",
        utm_campaign: "organic",
      };
    }
    if (host.includes("youtube"))
      return {
        utm_source: "youtube",
        utm_medium: "social",
        utm_campaign: "organic",
      };
    if (host.includes("bing"))
      return { utm_source: "bing", utm_medium: "organic", utm_campaign: "seo" };
    return {
      utm_source: host,
      utm_medium: "referral",
      utm_campaign: "organic",
    };
  } catch {
    return null;
  }
}

/**
 * Read UTMs from current URL. Returns null if no utm_* params present.
 */
function readUTMsFromURL() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  let hasAny = false;
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) {
      result[key] = value;
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

/**
 * Call this ONCE on app load (e.g. in LandingPage or App.jsx).
 * - Sets first-touch if not already set
 * - ALWAYS updates last-touch with the freshest signal (URL > referrer)
 */
export function captureUTMsOnLoad() {
  const fromURL = readUTMsFromURL();
  const fromReferrer = !fromURL ? detectFromReferrer() : null;
  const resolved = fromURL || fromReferrer;

  if (!resolved) return; // nothing to capture

  const payload = {
    utm_source: resolved.utm_source || "",
    utm_medium: resolved.utm_medium || "",
    utm_campaign: resolved.utm_campaign || "",
    utm_term: resolved.utm_term || "",
    utm_content: resolved.utm_content || "",
    captured_at: new Date().toISOString(),
  };

  // First-touch: write only once, ever
  if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(payload));
  }

  // Last-touch: ALWAYS overwrite with the freshest signal
  // Key fix: if this visit is organic/direct, we still overwrite so stale
  // paid UTMs from a previous session don't bleed in.
  localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(payload));
}

/**
 * Call this at form submission. Returns the UTMs to attach to the lead.
 * Priority for "last touch":
 *   1. UTMs currently in the URL (freshest possible signal)
 *   2. Last-touch from localStorage
 *   3. Referrer-based detection (computed fresh, not from storage)
 *   4. Hard fallback: direct/none/direct
 */
export function resolveUTMsForSubmission() {
  const fromURL = readUTMsFromURL();
  let lastTouch;

  if (fromURL) {
    lastTouch = fromURL;
  } else {
    try {
      const stored = JSON.parse(localStorage.getItem(LAST_TOUCH_KEY) || "null");
      lastTouch = stored ||
        detectFromReferrer() || {
          utm_source: "direct",
          utm_medium: "none",
          utm_campaign: "direct",
        };
    } catch {
      lastTouch = {
        utm_source: "direct",
        utm_medium: "none",
        utm_campaign: "direct",
      };
    }
  }

  let firstTouch = null;
  try {
    firstTouch = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || "null");
  } catch {
    firstTouch = null;
  }

  return {
    // Last-touch (what is called "latest")
    utm_source: lastTouch.utm_source || "",
    utm_medium: lastTouch.utm_medium || "",
    utm_campaign: lastTouch.utm_campaign || "",
    utm_term: lastTouch.utm_term || "",
    utm_content: lastTouch.utm_content || "",
    // First-touch (what is called "old")
    first_utm_source: firstTouch?.utm_source || "",
    first_utm_medium: firstTouch?.utm_medium || "",
    first_utm_campaign: firstTouch?.utm_campaign || "",
    first_utm_term: firstTouch?.utm_term || "",
    first_utm_content: firstTouch?.utm_content || "",
    first_captured_at: firstTouch?.captured_at || "",
  };
}

/**
 * Build a consistent lead_source string for Cratio.
 * Avoids "Website-website" type duplication.
 */
export function buildLeadSource(utms, formType /* "popup" | "landing" */) {
  const src = (utms.utm_source || "direct").toLowerCase();
  // If source is generic/internal, fall back to the form type
  if (src === "website" || src === "direct" || src === "") {
    return formType === "popup" ? "Website-Popup-Direct" : "Website-Direct";
  }
  return formType === "popup" ? `Website-Popup-${src}` : `Website-${src}`;
}
