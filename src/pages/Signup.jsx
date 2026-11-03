import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import {
  useMediaQuery,
  useTheme,
  Box,
  TextField,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Autocomplete,
  CircularProgress,
  Checkbox,
} from "@mui/material";
import Navbar2 from "../components/Navbar";
import Footer from "../components/Footer";
import pitCrewTag from "../assets/images/PitCrew_Tag.svg";
import Rocket from "../components/SVGs/Rocket";
import { Link, useNavigate } from "react-router-dom";
import debounce from "lodash/debounce";
import ScrollToTop from "../components/ScrollToTop";
import { useLocation } from "react-router-dom";
import LocationSelector from "../components/locationSelector";
import { APIProvider } from "@vis.gl/react-google-maps";
import { supabase } from "../supabaseClient";
import {
  resolveUTMsForSubmission,
  buildLeadSource,
} from "../utils/utmTracking";

import { getFunnelSessionId } from "../utils/funnelTracking";

// Fetch country codes and flags
const fetchCountryCodes = async () => {
  try {
    const response = await fetch("https://restcountries.com/v3.1/all");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Unexpected response format");
    return data
      .filter((country) => country.idd?.root)
      .map((country) => ({
        code: `${country.idd.root}${country.idd.suffixes ? country.idd.suffixes[0] : ""}`,
        name: country.name.common,
        flag: country.flags?.svg || "",
      }));
  } catch (error) {
    console.error("Error fetching country codes:", error);
    return [];
  }
};

// Search locations
const searchLocations = async (query, type, selectedCity = "") => {
  if (!query || query.length < 2) return [];

  try {
    const timestamp = new Date().getTime();
    const searchQuery =
      type === "area" && selectedCity
        ? `${query}, ${selectedCity}, india`
        : `${query}, india`;

    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(searchQuery)}&` +
      `format=json&` +
      `addressdetails=1&` +
      `limit=10&` +
      `countrycodes=in&` +
      `_=${timestamp}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "InLane Driving School Website",
        Accept: "application/json",
      },
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    if (type === "city") {
      return data
        .filter(
          (item) =>
            item.type === "city" ||
            item.type === "town" ||
            item.type === "administrative" ||
            (item.address &&
              (item.address.city ||
                item.address.town ||
                item.address.municipality)),
        )
        .map((item) => ({
          label: (
            item.address?.city ||
            item.address?.town ||
            item.address?.municipality ||
            item.display_name.split(",")[0]
          ).trim(),
          state: item.address?.state || "",
          value: item.place_id,
        }))
        .filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.label === item.label),
        );
    } else {
      return data
        .filter(
          (item) =>
            item.type === "suburb" ||
            item.type === "neighbourhood" ||
            item.type === "residential" ||
            (item.address &&
              (item.address.suburb ||
                item.address.neighbourhood ||
                item.address.residential)),
        )
        .map((item) => ({
          label: (
            item.address?.suburb ||
            item.address?.neighbourhood ||
            item.address?.residential ||
            item.display_name.split(",")[0]
          ).trim(),
          value: item.place_id,
        }))
        .filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.label === item.label),
        );
    }
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
};

// Form field component - Memoized to prevent unnecessary re-renders
const FormField = React.memo(({ label, children, bgColor }) => (
  <div className={`rounded-2xl p-4 md:p-6 ${bgColor}`}>
    <label className="block text-lg font-bold mb-2">{label}</label>

    {children}
  </div>
));

function getAllQueryParams(url = window.location.href) {
  const params = new URL(url).searchParams;
  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    city: null,
    area: null,
    license: "yes",
    countryCode: "+91",
    marketingConsent: false,
  });

  const [countryCodes, setCountryCodes] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [areaOptions, setAreaOptions] = useState([]);
  const [loading, setLoading] = useState({
    city: false,
    area: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Memoize theme and screen size checks to prevent unnecessary recalculations
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const isMediumScreen = useMediaQuery(theme.breakpoints.between("sm", "md"));

  // Memoize icon styles to prevent object recreation on every render
  const iconStyles = useMemo(
    () => ({
      small: { color: "#FFFFFF", width: 16, height: 16 },
      medium: { color: "#FFFFFF", width: 34, height: 34 },
      large: { color: "#FFFFFF", width: 40, height: 40 },
    }),
    [],
  );

  const IconStyle = useMemo(() => {
    return isSmallScreen
      ? iconStyles.small
      : isMediumScreen
        ? iconStyles.medium
        : iconStyles.large;
  }, [isSmallScreen, isMediumScreen, iconStyles]);

  // Load country codes on component mount
  useEffect(() => {
    let isMounted = true;

    const loadCountryCodes = async () => {
      try {
        const codes = await fetchCountryCodes();
        if (isMounted) {
          setCountryCodes(codes);
        }
      } catch (error) {
        console.error("Failed to load country codes:", error);
      }
    };

    loadCountryCodes();

    return () => {
      isMounted = false;
    };
  }, []);

  // Optimized debounced search functions with proper cleanup
  const debouncedCitySearch = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setCityOptions([]);
        return;
      }

      setLoading((prev) => ({ ...prev, city: true }));
      try {
        const results = await searchLocations(query, "city");
        setCityOptions(results);
      } catch (error) {
        console.error("City search failed:", error);
        setCityOptions([]);
      } finally {
        setLoading((prev) => ({ ...prev, city: false }));
      }
    }, 500), // Increased debounce time for better performance
    [],
  );

  const debouncedAreaSearch = useCallback(
    debounce(async (query) => {
      if (!formData.city || !query || query.length < 2) {
        setAreaOptions([]);
        return;
      }

      setLoading((prev) => ({ ...prev, area: true }));
      try {
        const results = await searchLocations(
          query,
          "area",
          formData.city.label,
        );
        setAreaOptions(results);
      } catch (error) {
        console.error("Area search failed:", error);
        setAreaOptions([]);
      } finally {
        setLoading((prev) => ({ ...prev, area: false }));
      }
    }, 500), // Increased debounce time for better performance
    [formData.city],
  );

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedCitySearch.cancel();
      debouncedAreaSearch.cancel();
    };
  }, [debouncedCitySearch, debouncedAreaSearch]);

  // Optimized form input handler
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "phone") {
      // Only allow numbers and limit to 10 digits
      const numericValue = value.replace(/[^0-9]/g, "");
      if (numericValue.length <= 10) {
        setFormData((prev) => ({ ...prev, [name]: numericValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  }, []);

  // Memoize phone validation function
  const isPhoneValid = useCallback((phone) => {
    return phone.length === 10;
  }, []);

  // Optimized form submission
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;


      // Validation
      if (!formData.email || !formData.name || !formData.phone) {
        alert("Please fill in all required fields");
        return;
      }

      if (!isPhoneValid(formData.phone)) {
        alert("Please enter a valid 10-digit phone number");
        return;
      }

      if (!formData.marketingConsent) {
        alert(
          "Please agree to receive marketing and transaction calls to continue",
        );
        return;
      }

      setIsSubmitting(true);

      const utmParams = resolveUTMsForSubmission();

      // Original delivery payloads (fallback when the server cannot forward)
      const googleSheetsUrl =
        "https://script.google.com/macros/s/AKfycbz45poihO1GSt_f-UxHHWltKWHh8mDNyaXPcFzbIURMvTVKj1qPn9STBILUaMiGme7r/exec";
      const payload = {
        email: formData.email,
        name: formData.name,
        phone: `${formData.countryCode}${formData.phone}`,
        license: formData.license === "yes" ? "yes" : "no",
        locality: `${formData?.city || ""}, ${formData?.area || ""}`,
        marketingConsent: formData.marketingConsent ? "yes" : "no",
        adName: "Signup Form",
        leadSource: buildLeadSource(utmParams, "landing"),
      };
      const cratioPayload = {
        ...utmParams,
        ...payload,
        timestamp: new Date().toISOString(),
      };

      try {
        // Primary path: capture-lead writes the lead to the funnel DB,
        // emits lead_captured, and forwards to Cratio + Sheets.
        // If it cannot forward, returns clientFallback: true.
        let clientFallback = true;
        try {
          const { data, error } = await supabase.functions.invoke("capture-lead", {
            body: {
              phone: formData.phone,
              country_code: formData.countryCode.replace(/\D/g, ""),
              name: formData.name,
              email: formData.email,
              city: formData.city || null,
              area: formData.area || null,
              license: formData.license === "yes" ? "yes" : "no",
              dl_status: formData.license === "yes" ? "has_dl" : "no_dl",
              source: "signup_page",
              ad_name: "Signup Form",
              sheets_target: "signup",
              client_session_id: getFunnelSessionId(),
              marketing_consent: formData.marketingConsent ? true : null,
              page_path: "/signup",
              attribution: {
                utm_source: utmParams.utm_source,
                utm_medium: utmParams.utm_medium,
                utm_campaign: utmParams.utm_campaign,
                utm_term: utmParams.utm_term,
                utm_content: utmParams.utm_content,
                gclid: utmParams.gclid,
              },
              first_touch: {
                first_utm_source: utmParams.first_utm_source,
                first_utm_medium: utmParams.first_utm_medium,
                first_utm_campaign: utmParams.first_utm_campaign,
                first_utm_term: utmParams.first_utm_term,
                first_utm_content: utmParams.first_utm_content,
                first_gclid: utmParams.first_gclid,
                first_captured_at: utmParams.first_captured_at,
              },
            },
          });

          if (!error && data?.ok) {
            clientFallback = data.clientFallback === true;
          } else if (error) {
            console.error("capture-lead error:", error.message);
          }
        } catch (captureError) {
          // capture-lead unreachable — fall through to original delivery
        }

        // Fallback: original direct delivery (only if server could not forward)
        if (clientFallback) {
          await Promise.all([
            fetch(googleSheetsUrl, {
              method: "POST",
              mode: "no-cors",
              cache: "no-cache",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }),
            fetch(import.meta.env.VITE_CRATIO_WEBHOOK_URL, {
              method: "POST",
              mode: "no-cors",
              cache: "no-cache",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(cratioPayload),
            }),
          ]);
        }

        // GA event (non-blocking, fire-and-forget)
        try {
          await supabase.functions.invoke("ga-event-manager", {
            body: {
              eventSource: "landing_page_signup",
              clientId: getOrCreateClientId() ?? "",
              leadData: { phone: formData.phone },
            },
          });
        } catch (_) {}

        navigate("/thank-you", {
          state: {
            name: formData.name,
            email: formData.email,
          },
        });
      } catch (error) {
        console.error("Signup submission error:", error);
        alert("Submission might have failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, isSubmitting, isPhoneValid, navigate],
  );

  function getOrCreateClientId() {
    const key = "custom_client_id";
    let clientId = localStorage.getItem(key);

    if (!clientId) {
      // crypto.randomUUID only exists on secure contexts (HTTPS / localhost).
      // Fallback UUID v4 generator so it works on plain-HTTP previews too.
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        clientId = crypto.randomUUID();
      } else {
        clientId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      localStorage.setItem(key, clientId);
    }

    return clientId;
  }

  // Optimized form submission function
  const submitToGoogleSheets = useCallback(async (formData) => {
    try {
      const utmParams = resolveUTMsForSubmission();
      const googleSheetsUrl =
        "https://script.google.com/macros/s/AKfycbz45poihO1GSt_f-UxHHWltKWHh8mDNyaXPcFzbIURMvTVKj1qPn9STBILUaMiGme7r/exec";
      const payload = {
        email: formData.email,
        name: formData.name,
        phone: `${formData.countryCode}${formData.phone}`,
        license: formData.license === "yes" ? "yes" : "no",
        locality: `${formData?.city || ""}, ${formData?.area || ""}`,
        marketingConsent: formData.marketingConsent ? "yes" : "no",
        adName: "Signup Form",
        leadSource: buildLeadSource(utmParams, "landing"),
      };

      // Submit to Google Sheets
      const googleSheetsPromise = fetch(googleSheetsUrl, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Submit to Cratio webhook
      const cratioPayload = {
        ...utmParams,
        ...payload,
        timestamp: new Date().toISOString(),
      };

      const cratioPromise = fetch(import.meta.env.VITE_CRATIO_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cratioPayload),
      });

      // Execute both requests in parallel for better performance
      const [googleResponse, cratioResponse] = await Promise.all([
        googleSheetsPromise,
        cratioPromise,
      ]);

      if (cratioResponse?.type === "opaque") {
        console.log("Cratio webhook delivered");
      }
      return { status: "success" };
    } catch (error) {
      console.error("Form submission error:", error);
      throw error;
    }
  }, []);

  // Send GA event - non-blocking, errors won't prevent form submission
  async function sendEventToGA(_eventName, _phone) {
    try {
      const { data, error } = await supabase.functions.invoke(
        "ga-event-manager",
        {
          body: {
            eventSource: _eventName,
            clientId: getOrCreateClientId() ?? "",
            leadData: {
              phone: _phone,
            },
          },
        },
      );

      if (error) {
        console.warn("GA event tracking failed (non-critical):", error.message);
        return null;
      }

      if (data) {
        return data;
      }
    } catch (error) {
      console.warn("GA event tracking error (non-critical):", error);
      return null;
    }
  }

  // Memoize static styles
  const scrollingTextStyle = useMemo(
    () => ({
      ".animate-scroll": {
        animation: "scroll 60s linear infinite",
      },
      "@keyframes scroll": {
        "0%": { transform: "translateX(0)" },
        "100%": { transform: "translateX(-50%)" },
      },
    }),
    [],
  );

  return (
    <div className="bg-logoWhite">
      <ScrollToTop />
      <Helmet>
        <title>Sign Up - InLane Driving School</title>
        <meta
          name="description"
          content="Sign up for driving lessons with InLane - India's modern driving school."
        />
      </Helmet>
      <Navbar2
        backgroundColor="#FFFFFF"
        logo="./LANE_LOGO.svg"
        burgerMenu="/PurpleHamburger.png"
      />

      <div className="flex overflow-hidden justify-center items-center mt-28 mb-24 w-full">
        <div className="inline-flex whitespace-nowrap">
          <div className="flex gap-10 animate-scroll sm:gap-16">
            {[...Array(7)].map((_, index) => (
              <span
                key={index}
                className="text-7xl md:text-7xl lg:text-8xl xl:text-9xl font-semibold text-[#00CE84]"
              >
                By Your Side, Every Ride 🚗
              </span>
            ))}
          </div>
        </div>
        <style>{`
          .animate-scroll {
            animation: scroll 60s linear infinite;
          }

          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-50%);
            }
          }
        `}</style>
      </div>

      <Box className="text-left mx-4 md:mx-40 bg-white p-4 md:p-8 rounded-lg border border-gray-200">
        <div className="font-['Bricolage_Grotesque'] max-w-2xl mx-auto text-left font-bold">
          <p className="text-2xl md:text-3xl lg:text-4xl font mb-4">
            We offer
            <span className="inline-block relative mx-2 font">
              <img
                src={pitCrewTag}
                alt="crew"
                className="absolute inset-0 z-10"
              />
              <span className="relative z-20">fun lessons</span>
            </span>
            with cool cars & instructors that match your vibe 🚗
          </p>
        </div>
        <form
          className="w-full max-w-2xl mx-auto font-['Bricolage_Grotesque']"
          onSubmit={handleSubmit}
        >
          {/* Hidden UTM Fields */}
          {/* <input
            type="hidden"
            name="utm_source"
            value={queryParams.utm_source || ""}
          />
          <input
            type="hidden"
            name="utm_medium"
            value={queryParams.utm_medium || ""}
          />
          <input
            type="hidden"
            name="utm_campaign"
            value={queryParams.utm_campaign || ""}
          /> */}

          <div className="my-8 space-y-4 md:space-y-6 md:my-16">
            {/* Email Field */}
            <FormField label="Your Email Id" bgColor="bg-[#D1B3FF]">
              <TextField
                fullWidth
                variant="outlined"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                type="email"
                className="bg-transparent"
                placeholder="Enter your email"
                inputProps={{
                  "aria-label": "Email",
                  style: { fontFamily: "Bricolage Grotesque" },
                }}
                InputLabelProps={{
                  style: { fontFamily: "Bricolage Grotesque" },
                }}
              />
            </FormField>
            <div className="h-6"></div>
            {/* Name Field */}
            <FormField label="Your Name" bgColor="bg-[#D9FF7A]">
              <TextField
                fullWidth
                variant="outlined"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="bg-transparent"
                placeholder="Enter your name"
                inputProps={{
                  "aria-label": "Name",
                  style: { fontFamily: "Bricolage Grotesque" },
                }}
                InputLabelProps={{
                  style: { fontFamily: "Bricolage Grotesque" },
                }}
              />
            </FormField>
            <div className="h-6"></div>
            {/* Phone Number Field with Country Code */}
            <FormField label="Your Phone Number" bgColor="bg-[#00CE84]">
              <div className="flex gap-2">
                <FormControl className="w-28">
                  <Select
                    value={formData.countryCode}
                    name="countryCode"
                    onChange={handleChange}
                    className="w-28"
                    renderValue={(selected) => {
                      const country = countryCodes.find(
                        (c) => c.code === selected,
                      );
                      return (
                        <div className="flex items-center">
                          {country && country.flag && (
                            <img
                              src={country.flag}
                              alt={country.name}
                              className="w-6 h-4 mr-2"
                            />
                          )}
                          {country ? country.code : selected}
                        </div>
                      );
                    }}
                  >
                    {countryCodes.map((country) => (
                      <MenuItem key={country.code} value={country.code}>
                        <div className="flex items-center">
                          {country.flag && (
                            <img
                              src={country.flag}
                              alt={country.name}
                              className="w-6 h-4 mr-2"
                            />
                          )}
                          {country.code} - {country.name}
                        </div>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  name="phone"
                  type="tel"
                  className="flex-1"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  error={
                    formData.phone.length > 0 && !isPhoneValid(formData.phone)
                  }
                  helperText={
                    formData.phone.length > 0 && !isPhoneValid(formData.phone)
                      ? "Please enter a valid 10-digit number"
                      : ""
                  }
                  placeholder="Enter phone number"
                  InputLabelProps={{
                    style: { fontFamily: "Bricolage Grotesque" },
                  }}
                  inputProps={{
                    "aria-label": "Phone Number",
                    maxLength: 10,
                    style: { fontFamily: "Bricolage Grotesque" },
                  }}
                />
              </div>
            </FormField>

            <div className="h-6"></div>
            {/* License Radio Group */}
            <FormField
              label="Do You Have A Four Wheeler (4W) Driver's License?"
              bgColor="bg-[#D1B3FF]"
            >
              <RadioGroup
                row
                name="license"
                value={formData.license}
                onChange={handleChange}
                aria-label="License"
              >
                <FormControlLabel
                  value="yes"
                  control={<Radio className="text-[#00CE84]" />}
                  label={
                    <Typography className="font-['Bricolage_Grotesque']">
                      Yes
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="no"
                  control={<Radio className="text-[#00CE84]" />}
                  label={
                    <Typography className="font-['Bricolage_Grotesque']">
                      No
                    </Typography>
                  }
                />
              </RadioGroup>
            </FormField>
            <div className="h-6"></div>
            {/* City and Area Selection */}
            <FormField
              label="Which Locality Are You Based out of?"
              bgColor="bg-[#D9FF7A]"
            >
              <APIProvider
                apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                libraries={["places"]}
              >
                <LocationSelector
                  formData={formData}
                  setFormData={setFormData}
                />
              </APIProvider>
            </FormField>
            <div className="h-6"></div>
            {/* Marketing Consent */}
            <FormControlLabel
              sx={{ alignItems: "flex-start" }}
              control={
                <Checkbox
                  name="marketingConsent"
                  checked={formData.marketingConsent}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      marketingConsent: e.target.checked,
                    }))
                  }
                  className="text-[#00CE84]"
                />
              }
              label={
                <Typography className="font-['Bricolage_Grotesque']">
                  I provide my explicit consent to receive Inlane's
                  communications via Voice Calls, SMS, WhatsApp, RCS, and Email
                  for transactional, service, and promotional purposes. I
                  understand that I can opt-out at any time and that this
                  consent overrides my DND/NCPR registration. By proceeding, I
                  agree to the Terms & Conditions and Privacy Policy.
                </Typography>
              }
            />
            <div className="h-6"></div>
            <div className="text-sm text-gray-600">
              By continuing, you agree to our{" "}
              <a
                target="_blank"
                href="https://inlane.in/terms-and-conditions"
                className="text-muted-foreground text-gray-500 underline"
                rel="noreferrer"
              >
                Terms of Service
              </a>
              <a
                target="_blank"
                href="https://inlane.in/privacy-policy"
                className="text-muted-foreground text-gray-500 underline"
                rel="noreferrer"
              >
                Privacy Policies
              </a>
            </div>
            {/* Submit Button */}
            <div className="flex justify-center">
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
                startIcon={
                  isSubmitting ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <Rocket color={IconStyle} />
                  )
                }
                sx={{
                  background: isSubmitting
                    ? "rgba(0, 206, 132, 0.7)"
                    : "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  color: "white",
                  fontWeight: "bold",
                  fontFamily: "Bricolage Grotesque",
                  textDecoration: "none",
                  textTransform: "none",
                  "&:hover": {
                    background: isSubmitting
                      ? "rgba(0, 206, 132, 0.7)"
                      : "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                  },
                  "&:disabled": {
                    color: "white",
                    cursor: "not-allowed",
                  },
                  border: "2px solid #FFFFFF",
                  borderRadius: "50px",
                  padding: {
                    xs: "10px 20px",
                    md: "6px 68px",
                  },
                  fontSize: { xs: "0.8rem", sm: "1rem", md: "24px" },
                  whiteSpace: "nowrap",
                  boxShadow: "2px 4px 4px rgba(0, 0, 0, 0.35)",
                }}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        </form>
      </Box>

      <div className="flex justify-center items-center mt-52"></div>
      <Footer />
    </div>
  );
};

export default Signup;
