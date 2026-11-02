// Imperative Google Maps JS API loader — deliberately NOT using
// `@vis.gl/react-google-maps`'s declarative <Map> wrapper. That wrapper
// re-applies `center`/`zoom` on every render and resets the user's zoom
// level (documented bug, fixed the same way in the booking funnel's own
// `googleMapsLoader.js`). A plain `<script>` load + imperative
// `new google.maps.Map(...)` avoids that entirely.
export const mapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();

let mapsPromise = null;

export function loadMapsApi() {
  if (mapsPromise) return mapsPromise;
  if (!mapsApiKey) {
    mapsPromise = Promise.resolve(null);
    return mapsPromise;
  }
  if (window.google?.maps) {
    mapsPromise = Promise.resolve(window.google.maps);
    return mapsPromise;
  }
  mapsPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (gm) => {
      if (settled) return;
      settled = true;
      resolve(gm);
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.onload = () => finish(window.google?.maps ?? null);
    script.onerror = () => finish(null);
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const SPECIFIC_PLACE_TYPES = new Set([
  "establishment",
  "point_of_interest",
  "premise",
  "subpremise",
]);

export async function geocodeText(gm, text) {
  if (!gm) return null;
  const { Geocoder } = await gm.importLibrary("geocoding");
  const geocoder = new Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address: text }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve(null);
        return;
      }
      const specific = results.find((r) =>
        r.types?.some((t) => SPECIFIC_PLACE_TYPES.has(t)),
      );
      const loc = (specific ?? results[0]).geometry?.location;
      resolve(loc ? { lat: loc.lat(), lng: loc.lng() } : null);
    });
  });
}

// Reverse-geocode a dropped pin/map click into a human-readable address so the
// "search first, drag to refine" flow labels the actual pin position.
export async function geocodeLatLng(gm, lat, lng) {
  if (!gm) return null;
  const { Geocoder } = await gm.importLibrary("geocoding");
  const geocoder = new Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve(null);
        return;
      }
      const r = results[0];
      const label =
        r.formatted_address ||
        (Array.isArray(r.address_components)
          ? r.address_components.map((c) => c.long_name).filter(Boolean).join(", ")
          : null);
      resolve(label || null);
    });
  });
}
