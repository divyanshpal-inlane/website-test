import { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle2, Loader2, MapPin, XCircle, Navigation, Search } from "lucide-react";
import { checkLocationServiceability } from "../../services/bookingApi";
import { loadMapsApi, geocodeText, geocodeLatLng } from "../../lib/googleMapsLoader";

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_ZOOM = 11;
const PICK_ZOOM = 15;

// Brand-green draggable pin (Swiggy/Zomato/Porter style). Anchored at the tip.
const PIN_ICON_URI = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
     <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="#00ce84"/>
     <circle cx="18" cy="18" r="7" fill="#ffffff"/>
   </svg>`,
)}`;

export default function BookingLocationSelector({ form, onChange }) {
  const inputRef = useRef(null);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const clickListenerRef = useRef(null);
  const autoRef = useRef(null);
  const selectedPlaceRef = useRef(null);

  // undefined = loading, null = failed / no key, object = ready
  const [maps, setMaps] = useState(undefined);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [selected, setSelected] = useState(
    form.latitude != null && form.longitude != null
      ? { lat: form.latitude, lng: form.longitude, label: form.locationName || "" }
      : null,
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load the Maps JS API once for the whole app
  useEffect(() => {
    let cancelled = false;
    loadMapsApi().then((gm) => {
      if (!cancelled) setMaps(gm);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkAndUpdate = useCallback(async (latitude, longitude, locationName) => {
    setChecking(true);
    setError(null);
    const fail = () => {
      onChangeRef.current({
        areaId: null,
        areaName: null,
        latitude: null,
        longitude: null,
        locationName,
        serviceable: false,
        firstSlot: null,
        planPreview: null,
      });
    };
    try {
const result = await checkLocationServiceability({ latitude, longitude });

      const areaLabel = result.areaName || "Not serviceable";
      console.log(
        `%c[location] ${locationName || "(map pin)"} - ${areaLabel}`,
        "color:#00ce84;font-weight:bold",
      );

      if (result.serviceable) {
        // Serviceability = a non-rough instructor polygon covers the point. The
        // area name is only a display label (areaId may legitimately be null).
        onChangeRef.current({
          areaId: result.areaId || null,
          areaName: result.areaName || result.areaLabel || locationName || null,
          latitude,
          longitude,
          locationName,
          serviceable: true,
          firstSlot: null,
          planPreview: null,
        });
      } else {
        fail();
      }
} catch (e) {
      console.error("[location] serviceability check failed:", e);
      setError(
        e?.code === "validation_error" && typeof e?.message === "string"
          ? e.message
          : "We couldn't verify your location right now. Please check your connection and try again.",
      );
      fail();
    } finally {
      setChecking(false);
    }
  }, []);

// Reverse-geocode a coordinate into a human label (falls back to the text in
  // the search box, then "lat, lng").
  const labelFor = useCallback(async (lat, lng) => {
    const gm = window.google?.maps;
    const guess = gm ? await geocodeLatLng(gm, lat, lng) : null;
    return (
      guess ||
      inputRef.current?.value?.trim() ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    );
  }, []);

  // Single entry point for any picked location: move pin, zoom map, check serviceability
  const applyLocation = useCallback(
    (lat, lng, label) => {
      const map = mapRef.current;
      const gm = window.google?.maps;
      if (!gm) return;

      // Tear down the old pin
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }

      const position = { lat, lng };
      markerRef.current = new gm.Marker({
        map,
        position,
        title: label || "Selected location",
        draggable: true,
        icon: { url: PIN_ICON_URI, anchor: new gm.Point(18, 46) },
        animation: gm.Animation?.DROP,
      });

      // Pin drag = fine-tune. Reverse-geocode the NEW position so the label
      // follows the actual pin ("search first, drag to refine").
      if (markerRef.current) {
        markerRef.current.addListener("dragend", (ev) => {
          const p = ev.latLng;
          const dLat = p.lat();
          const dLng = p.lng();
          void (async () => {
            const dLabel = await labelFor(dLat, dLng);
            if (inputRef.current) inputRef.current.value = dLabel;
            setSelected({ lat: dLat, lng: dLng, label: dLabel });
            checkAndUpdate(dLat, dLng, dLabel);
          })();
        });
      }

      if (map) {
        map.setCenter(position);
        map.setZoom(PICK_ZOOM);
      }

      setSelected({ lat, lng, label });
      checkAndUpdate(lat, lng, label);
    },
    [checkAndUpdate, labelFor],
  );

  // Create the map once the API is ready and the container exists
  useEffect(() => {
    if (!maps || !mapElRef.current || mapRef.current) return;

    const map = new maps.Map(mapElRef.current, {
      center: selected ? { lat: selected.lat, lng: selected.lng } : DEFAULT_CENTER,
      zoom: selected ? PICK_ZOOM : DEFAULT_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

// Click anywhere on the map to drop/move the pin
    clickListenerRef.current = map.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      void (async () => {
        const label = await labelFor(lat, lng);
        applyLocation(lat, lng, label);
      })();
    });
  }, [maps, selected, applyLocation, labelFor]);

  // Attach the Places Autocomplete widget to the input
  useEffect(() => {
    if (!maps || !inputRef.current || autoRef.current) return;
    try {
      const ac = new maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "IN" },
        fields: ["name", "formatted_address", "geometry"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const lat = loc.lat();
        const lng = loc.lng();
        const label = place.formatted_address || place.name || inputRef.current?.value || "";
        if (inputRef.current) inputRef.current.value = place.name || label;
        applyLocation(lat, lng, label);
      });
      autoRef.current = ac;
    } catch (err) {
      console.error("Failed to initialize Google Maps Autocomplete:", err);
    }
    return () => {
      autoRef.current?.unbindAll();
      autoRef.current = null;
    };
  }, [maps, applyLocation]);

  // Text search fallback (Enter / Search button) when no suggestion was picked
  const runSearch = useCallback(async () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    setGeoError(null);

    if (!maps) {
      setGeoError(
        maps === null
          ? "Google Maps isn't configured — please search using the map."
          : "Still loading the map — try again in a moment.",
      );
      return;
    }
    const pt = await geocodeText(maps, text);
    if (pt) {
      applyLocation(pt.lat, pt.lng, text);
    } else {
      setGeoError(`Couldn't find "${text}". Try a different area or click a suggestion.`);
    }
  }, [maps, applyLocation]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser. Please search for your location instead.");
      return;
    }
    setChecking(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        applyLocation(latitude, longitude, "Current location (GPS)");
      },
      (err) => {
        let msg = "Couldn't get your location. ";
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg += "Permission denied. Please enable location access or search for your location instead.";
            break;
          case err.POSITION_UNAVAILABLE:
            msg += "Location unavailable. Please try again or search for your location.";
            break;
          case err.TIMEOUT:
            msg += "Request timed out. Please try again or search for your location.";
            break;
          default:
            msg += "Please search for your location instead.";
        }
        setError(msg);
        setChecking(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [applyLocation]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="h-5 w-5 text-[#00ce84]" />
        <h2 className="text-xl font-semibold">Where do you want your driving lessons?</h2>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Search for your area or click the map — then drag the pin to your exact pickup point.
      </p>

      {/* Search input */}
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Search your location"
          className="flex-1 rounded-[12px] border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none hover:border-[#00ce84] focus:border-[#00ce84]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
        />
        <button
          type="button"
          disabled={!maps}
          onClick={() => void runSearch()}
          className="rounded-[12px] bg-[#00ce84] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Search
        </button>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={checking}
          className="rounded-[12px] border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-[#00ce84] disabled:opacity-50"
          title="Use my current location"
        >
          <Navigation className="inline h-4 w-4" />
        </button>
      </div>

      {geoError && (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700">
          {geoError}
        </div>
      )}

{/* Map */}
      <div className="relative rounded-[12px] border border-gray-200 overflow-hidden">
        {maps ? (
          <div ref={mapElRef} style={{ width: "100%", height: "350px" }} aria-label="Pickup location map" />
        ) : (
          <div style={{ width: "100%", height: "350px" }} className="flex items-center justify-center bg-gray-50">
            {maps === null ? (
              <p className="text-sm text-gray-500">Map unavailable. Please search by typing a location.</p>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin text-[#00ce84]" />
                <p>Loading map…</p>
              </div>
            )}
          </div>
        )}

        {/* Search-first, drag-to-refine hints */}
        {maps && !selected && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <div className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-gray-700 shadow-md">
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-[#00ce84]" />
              Search your area, then drag the pin to your exact pickup point
            </div>
          </div>
        )}
        {maps && selected && (
          <div className="pointer-events-none absolute left-2 top-2 max-w-[70%]">
            <div className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-md">
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-[#00ce84]" />
              {selected.label || "Selected location"}
              <span className="ml-1 text-white/70">· drag to adjust</span>
            </div>
          </div>
        )}
      </div>

      {/* Status messages */}
      {form.serviceable && form.areaName && (
        <div className="mt-3 rounded-2xl border border-[#D9FF7A] bg-[#F7FFE0] p-4 text-sm flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#00ce84]" />
          <div>
            <p className="font-semibold text-gray-900">Great — we teach in {form.areaName}.</p>
            <p className="text-gray-600 mt-0.5 break-words">{form.locationName}</p>
          </div>
        </div>
      )}

      {form.locationName && !form.serviceable && !checking && !error && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm flex items-start gap-2">
          <XCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-gray-700">
            We don't teach at this exact location yet. Try a nearby place where you can meet your trainer.
          </p>
        </div>
      )}

      {checking && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking availability at this location…
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
          {error}
        </div>
      )}
    </section>
  );
}























