import React, { useRef, useEffect, useState, useCallback } from "react";
import { MapPin, Search, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { TextField, Button, Box, CircularProgress, Typography } from "@mui/material";
import { trackFunnelEvent } from "../utils/funnelTracking";

const HomepageLocationSearch = ({ onLocationChecked }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [address, setAddress] = useState("");
  const [addressLat, setAddressLat] = useState(null);
  const [addressLng, setAddressLng] = useState(null);
  const [addressName, setAddressName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [places, setPlaces] = useState(null);

  // Initialize Google Places
  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.maps?.places) {
      setPlaces(window.google.maps.places);
    }
  }, []);

  useEffect(() => {
    if (!inputRef.current || !places || autocompleteRef.current) return;

    autocompleteRef.current = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "IN" },
      fields: ["address_components", "formatted_address", "geometry", "name"],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      if (!place?.geometry?.location) return;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const name = place.name || place.formatted_address || "";

      setAddressLat(lat);
      setAddressLng(lng);
      setAddressName(name);
      setAddress(name);
      setResult(null); // Clear previous result
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [places]);

  const checkServiceability = useCallback(async () => {
    if (!addressLat || !addressLng) {
      if (address.trim()) {
        // Try geocoding the manual input
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, async (results, status) => {
          if (status === "OK" && results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            const name = results[0].formatted_address;
            setAddressLat(lat);
            setAddressLng(lng);
            setAddressName(name);
            await checkServiceabilityWithCoords(lat, lng, name);
          } else {
            setResult({ serviceable: false, error: "Could not find this location. Please try again." });
          }
        });
      }
      return;
    }
    await checkServiceabilityWithCoords(addressLat, addressLng, addressName || address);
  }, [address, addressLat, addressLng, addressName]);

  const checkServiceabilityWithCoords = async (lat, lng, name) => {
    setChecking(true);
    setResult(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-location-serviceability`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            client_session_id: getFunnelSessionId(),
            input_source: "search",
          }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        setResult({ ...data, locationName: name });
        // Track location_entered event
        trackFunnelEvent("location_entered", {
          area_id: data.areaId,
          area_name: data.areaName || data.areaLabel,
          serviceable: data.serviceable,
          input_source: "search",
        });
        // Call the callback
        if (onLocationChecked) {
          onLocationChecked(data, name, lat, lng);
        }
      } else {
        setResult({ serviceable: false, error: data.error?.message || "Serviceability check failed." });
      }
    } catch (error) {
      console.error("Serviceability check error:", error);
      setResult({ serviceable: false, error: "Could not check availability. Please try again." });
    } finally {
      setChecking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkServiceability();
    }
  };

  const reset = () => {
    setAddress("");
    setAddressLat(null);
    setAddressLng(null);
    setAddressName("");
    setResult(null);
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 600, mx: "auto" }}>
      <Box sx={{ position: "relative", mb: 2 }}>
        <MapPin sx={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#00CE84", width: 24, height: 24 }} />
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Enter your apartment name or nearest landmark to check availability"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          size="large"
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "50px",
              paddingLeft: 56,
              paddingRight: 56,
              backgroundColor: "white",
              "&:hover fieldset": { borderColor: "#00CE84" },
              "&.Mui-focused fieldset": { borderColor: "#00CE84", borderWidth: 2 },
            },
            "& .MuiInputBase-input": {
              fontFamily: "Bricolage Grotesque",
              fontSize: "18px",
              padding: "16px 0",
            },
          }}
          InputProps={{
            startAdornment: null,
            endAdornment: (
              <Box sx={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>
                {checking ? (
                  <CircularProgress size={24} color="success" />
                ) : (
                  <Button
                    onClick={checkServiceability}
                    disabled={checking || (!address.trim() && !addressLat)}
                    variant="contained"
                    size="small"
                    sx={{
                      borderRadius: "50px",
                      background: "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                      color: "white",
                      fontWeight: 700,
                      fontFamily: "Bricolage Grotesque",
                      textTransform: "none",
                      boxShadow: "0 4px 12px rgba(0,206,132,0.3)",
                    }}
                  >
                    Check
                  </Button>
                )}
              </Box>
            ),
          }}
        />
      </Box>

      {result && (
        <Box
          sx={{
            mt: 2,
            p: 3,
            borderRadius: 3,
            backgroundColor: result.serviceable ? "#F7FFE0" : "#FFF0F0",
            border: result.serviceable ? "2px solid #D9FF7A" : "2px solid #FFCCCC",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {result.serviceable ? (
            <>
              <CheckCircle sx={{ color: "#00CE84", width: 28, height: 28, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, color: "#006B3E" }}>
                  Great! We teach in {result.areaName || result.areaLabel || "your area"}
                </Typography>
                <Typography variant="body2" sx={{ color: "#37474F", mt: 0.5 }}>
                  {result.eligibleInstructorCount} instructor{result.eligibleInstructorCount !== 1 ? "s" : ""} available nearby
                </Typography>
              </Box>
            </>
          ) : (
            <>
              <AlertCircle sx={{ color: "#E53935", width: 28, height: 28, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, color: "#C62828" }}>
                  We're not in your area yet
                </Typography>
                <Typography variant="body2" sx={{ color: "#37474F", mt: 0.5 }}>
                  {result.error || "We don't have instructors available near this location."}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      )}

      <Box component="input" type="hidden" value={addressLat} />
      <Box component="input" type="hidden" value={addressLng} />
      <Box component="input" type="hidden" value={addressName} />
    </Box>
  );
};

function getFunnelSessionId() {
  const SESSION_STORAGE_KEY = "lane_funnel_session_id";
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export default HomepageLocationSearch;