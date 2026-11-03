import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Loader2, XCircle, CheckCircle2, Navigation, Search } from "lucide-react";
import { trackFunnelEvent } from "../../utils/funnelTracking";
import { loadMapsApi, geocodeText, geocodeLatLng } from "../../lib/googleMapsLoader";
import { checkLocationServiceability } from "../../services/bookingApi";
import { useBooking } from "../../context/BookingContext";

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const PICK_ZOOM = 15;

export default function HomepageLocationSearch() {
  const navigate = useNavigate();
  const { setForm } = useBooking();
  const inputRef = useRef(null);
  const autoRef = useRef(null);

  const [maps, setMaps] = useState(undefined);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Load the Maps JS API once
  useEffect(() => {
    let cancelled = false;
    loadMapsApi().then((gm) => {
      if (!cancelled) setMaps(gm);
    });
    return () => { cancelled = true; };
  }, []);

  const checkAndUpdate = useCallback(async (latitude, longitude, locationName, inputSource = "search") => {
    setChecking(true);
    setError(null);
    const fail = () => {
      setForm({
        areaId: null,
        areaName: null,
        latitude: null,
        longitude: null,
        locationName,
        serviceable: false,
        startDate: null,
        preferredSlots: [],
        planPreview: null,
      });
    };
    try {
      const result = await checkLocationServiceability({ latitude, longitude, input_source: inputSource });
      const areaLabel = result.areaName || "Not serviceable";
      console.log(`%c[homepage location] ${locationName || "(map pin)"} - ${areaLabel}`, "color:#00ce84;font-weight:bold");

      if (result.serviceable) {
        const update = {
          areaId: result.areaId || null,
          areaName: result.areaName || result.areaLabel || locationName || null,
          latitude,
          longitude,
          locationName,
          serviceable: true,
          startDate: null,
          preferredSlots: [],
          planPreview: null,
        };
        setForm(update);
        setSelected({ lat: latitude, lng: longitude, label: update.areaName || locationName });
      } else {
        fail();
      }
    } catch (e) {
      console.error("[homepage location] serviceability check failed:", e);
      setError(
        e?.code === "validation_error" && typeof e?.message === "string"
          ? e.message
          : "We couldn't verify your location right now. Please check your connection and try again.",
      );
      fail();
    } finally {
      setChecking(false);
    }
  }, [setForm]);

  const labelFor = useCallback(async (lat, lng) => {
    const gm = window.google?.maps;
    const guess = gm ? await geocodeLatLng(gm, lat, lng) : null;
    return guess || inputRef.current?.value?.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, []);

  // Attach Places Autocomplete
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
        checkAndUpdate(lat, lng, label);
      });
      autoRef.current = ac;
    } catch (err) {
      console.error("Failed to initialize Google Maps Autocomplete:", err);
    }
    return () => { autoRef.current?.unbindAll(); autoRef.current = null; };
  }, [maps, checkAndUpdate]);

  // Text search fallback (Enter key)
  const runSearch = useCallback(async () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    setGeoError(null);

    if (!maps) {
      setGeoError(maps === null ? "Google Maps isn't configured — please try again." : "Still loading the map — try again in a moment.");
      return;
    }
    const pt = await geocodeText(maps, text);
    if (pt) {
      checkAndUpdate(pt.lat, pt.lng, text);
    } else {
      setGeoError(`Couldn't find "${text}". Try a different area or select a suggestion.`);
    }
  }, [maps, checkAndUpdate]);

  // Current location via the small icon inside the input
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
        checkAndUpdate(latitude, longitude, "Current location (GPS)", "gps");
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
  }, [checkAndUpdate]);

  // Navigate to booking flow when location is confirmed
  const handleContinue = useCallback(() => {
    const text = inputRef.current?.value?.trim();
    if (!text && !selected) {
      setGeoError("Please enter a location or select a suggestion first.");
      return;
    }
    if (checking) return;

    // If we have a selected place from autocomplete, use it
    if (selected) {
      void trackFunnelEvent("location_entered", {
        source: "homepage_hero",
        area_name: selected.label,
        input_source: "search",
      });
      navigate("/book");
      return;
    }

    // Otherwise, try to geocode the text input
    void runSearch();
    // runSearch will call checkAndUpdate which sets selected, then we can navigate
    // But we need to wait for it - let's use a small delay or just let the user click again
  }, [selected, checking, navigate, runSearch]);

  const isReady = (selected || inputRef.current?.value?.trim()) && !checking;

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="font-['Bricolage_Grotesque'] font-bold text-[#3C4856] text-[22px] sm:text-[28px] md:text-[32px]">
          Where would you like to learn to drive?
        </h2>
        <p className="mt-2 text-gray-500 text-[14px] sm:text-[16px] max-w-md mx-auto">
          Enter your pickup location to find driving lessons near you.
        </p>
      </div>

      {/* Search input with icons inside */}
      <div className="relative mb-4">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Search your location (e.g., Indiranagar, Koramangala)"
          className="w-full rounded-[12px] border border-gray-200 bg-white pl-12 pr-12 py-4 text-base outline-none
                       hover:border-[#00ce84] focus:border-[#00ce84] focus:ring-2 focus:ring-[#00ce84]/20"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleContinue();
            }
          }}
        />
        {checking ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00ce84]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={checking}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-[#00ce84] hover:bg-[#00ce84]/10 rounded-full transition-all duration-200 disabled:opacity-50"
            aria-label="Use my current location"
          >
            <Navigation className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Primary CTA button - full width */}
      <button
        type="button"
        disabled={!isReady}
        onClick={handleContinue}
        className="w-full rounded-[12px] bg-gradient-to-b from-[#00CE84] to-[#00BC78]
                   shadow-[0_4px_16px_rgba(0,206,132,0.35)]
                   transition-all duration-200 hover:shadow-[0_8px_24px_rgba(0,206,132,0.45)]
                   hover:-translate-y-[1px] active:translate-y-[0] active:shadow-[0_2px_8px_rgba(0,206,132,0.35)]
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00CE84]/50
                   disabled:opacity-50 disabled:cursor-not-allowed
                   h-[56px] sm:h-[60px] px-6
                   flex items-center justify-center gap-2"
      >
        <span className="font-['Bricolage_Grotesque'] font-semibold text-white text-[16px] sm:text-[17px] whitespace-nowrap">
          Find My Driving Lessons
        </span>
        <MapPin color="#FFFFFF" size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {/* Validation / Error messages */}
      {(geoError || error) && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700 text-center">
          {geoError || error}
        </div>
      )}

      {/* Success state - location confirmed */}
      {selected && !checking && !error && !geoError && (
        <div className="mt-4 rounded-2xl border border-[#D9FF7A] bg-[#F7FFE0] p-4 text-sm flex items-center justify-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#00ce84]" />
          <p className="font-semibold text-gray-900">Great — we teach in <span className="text-[#00B97A]">{selected.label}</span>.</p>
        </div>
      )}

      {checking && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking availability at this location…
        </div>
      )}
    </div>
  );
}