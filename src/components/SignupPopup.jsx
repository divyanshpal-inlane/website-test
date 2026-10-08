import React, { useState, useCallback, useEffect } from "react";
import {
  TextField,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { APIProvider } from "@vis.gl/react-google-maps";
import LocationSelector from "./locationSelector";
import { supabase } from "../supabaseClient";
import {
  resolveUTMsForSubmission,
  buildLeadSource,
} from "../utils/utmTracking";

// Fetch country codes
const fetchCountryCodes = async () => {
  try {
    const response = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,idd",
    );
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

const SignupPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countryCodes, setCountryCodes] = useState([]);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    city: null,
    area: null,
    license: "yes",
    countryCode: "+91",
  });

  // Show popup for the FIRST time after 2 seconds (only if never shown before)
  useEffect(() => {
    const count = parseInt(localStorage.getItem("popup_show_count") || "0", 10);
    if (count >= 1) return; // Already shown at least once
    const timer = setTimeout(() => {
      setIsVisible(true);
      localStorage.setItem("popup_show_count", "1");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Load country codes
  useEffect(() => {
    let isMounted = true;
    fetchCountryCodes().then((codes) => {
      if (isMounted) setCountryCodes(codes);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleClose = () => {
    const count = parseInt(localStorage.getItem("popup_show_count") || "0", 10);
    setIsVisible(false);

    if (count === 1 || count === 2) {
      // First or second close — schedule next appearance after 30 seconds
      setTimeout(() => {
        setIsVisible(true);
        localStorage.setItem("popup_show_count", String(count + 1));
      }, 30000);
    }
    // If count >= 3, do nothing — popup is done forever
  };

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const numericValue = value.replace(/[^0-9]/g, "");
      if (numericValue.length <= 10) {
        setFormData((prev) => ({ ...prev, [name]: numericValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  }, []);

  const isPhoneValid = useCallback((phone) => phone.length === 10, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      if (!formData.email || !formData.name || !formData.phone) {
        alert("Please fill in all required fields");
        return;
      }
      if (!isPhoneValid(formData.phone)) {
        alert("Please enter a valid 10-digit phone number");
        return;
      }

      setIsSubmitting(true);

      console.log(
        "🔍 DEBUG: utmParams at form submission:",
        resolveUTMsForSubmission(),
      );

      try {
        const googleSheetsUrl =
          "https://script.google.com/macros/s/AKfycbz45poihO1GSt_f-UxHHWltKWHh8mDNyaXPcFzbIURMvTVKj1qPn9STBILUaMiGme7r/exec";

        // UTM params matching the popup signup URL
        // const utmParams = {
        //   utm_source: "website",
        //   utm_medium: "popup",
        //   utm_campaign: "signup_popup",
        //   utm_content: "homepage_popup",
        // };
        const utmParams = resolveUTMsForSubmission();
        console.log("📤 Submitting form with UTM parameters:", utmParams);

        const payload = {
          email: formData.email,
          name: formData.name,
          phone: `${formData.countryCode}${formData.phone}`,
          license: formData.license === "yes" ? "yes" : "no",
          locality: `${formData?.city || ""}, ${formData?.area || ""}`,
          adName: "Popup Signup Form",
          leadSource: buildLeadSource(utmParams, "popup"),
        };

        console.log("📊 Google Sheets Payload:", payload);

        // Cratio payload mirrors Signup.jsx: spread utmParams first, then payload fields
        const cratioPayload = {
          ...utmParams, // includes both last-touch and first_* fields
          ...payload,
          timestamp: new Date().toISOString(),
        };

        console.log(
          "🎯 Cratio Webhook Payload (includes all UTM params):",
          cratioPayload,
        );

        const [, cratioResponse] = await Promise.all([
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

        if (cratioResponse.type === "opaque") {
          console.log("✅ Cratio webhook request sent successfully");
        }

        console.log("✅ Popup form submission completed successfully");

        // GA event (non-blocking)
        try {
          await supabase.functions.invoke("ga-event-manager", {
            body: {
              eventSource: "popup_signup",
              clientId: getOrCreateClientId(),
              leadData: { phone: formData.phone },
            },
          });
        } catch (_) {}

        localStorage.setItem("popup_show_count", "2"); // Mark as fully done — never show again
        handleClose();
        window.location.href = "/thank-you";
      } catch (error) {
        console.error("❌ Popup submission error:", error);
        alert("Submission might have failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, isSubmitting, isPhoneValid],
  );

  if (!isVisible) return null;

  return (
    <>
      <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(0, 0, 0, 0.15);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(0, 0, 0, 0.3);
                }
            `}</style>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[999] backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center p-4 overflow-y-auto w-full h-full font-['Bricolage_Grotesque']">
        <div className="relative bg-white shadow-2xl w-full max-w-md mx-auto rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Close button  */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 transition-colors text-white font-bold text-sm"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Header Image Area */}
          <div className="w-full shrink-0 relative flex flex-col items-center justify-start overflow-hidden bg-transparent">
            <img
              src="/popup_image.png"
              alt="Start Your Journey"
              className="w-full h-32 sm:h-40 object-cover object-center"
            />
            <img
              src="/NavbarRoad.svg"
              alt="Road Sep"
              className="w-full block aspect-[100/1] object-cover"
              style={{ minHeight: "8px" }}
            />
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto px-6 py-3 sm:py-4 custom-scrollbar">
            {/* Title Section */}
            <div className="text-center mb-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#00CE84]">
                Start Your Driving Journey!
              </h2>
              <p className="text-gray-600 mt-0.5 text-xs sm:text-sm">
                Fill in your details and we'll get you started.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Your Email ID
                </label>
                <TextField
                  fullWidth
                  variant="outlined"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="Your mail id"
                  size="small"
                  inputProps={{
                    style: {
                      fontFamily: "Bricolage Grotesque",
                      fontSize: "14px",
                      padding: "8px 12px",
                    },
                  }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px" } }}
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Your Name
                </label>
                <TextField
                  fullWidth
                  variant="outlined"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Enter your name"
                  size="small"
                  inputProps={{
                    style: {
                      fontFamily: "Bricolage Grotesque",
                      fontSize: "14px",
                      padding: "8px 12px",
                    },
                  }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px" } }}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Your Phone Number
                </label>
                <div className="flex gap-2">
                  <FormControl
                    sx={{
                      minWidth: "110px",
                      "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                    }}
                  >
                    <Select
                      value={formData.countryCode}
                      name="countryCode"
                      onChange={handleChange}
                      size="small"
                      renderValue={(selected) => {
                        const country = countryCodes.find(
                          (c) => c.code === selected,
                        );
                        return (
                          <div className="flex items-center text-sm font-['Bricolage_Grotesque']">
                            {country?.flag && (
                              <img
                                src={country.flag}
                                alt={country.name}
                                className="w-5 h-3 mr-1"
                              />
                            )}
                            <span className="text-gray-600">
                              {country ? country.code : selected}
                            </span>
                          </div>
                        );
                      }}
                      sx={{ "& .MuiSelect-select": { padding: "8px 12px" } }}
                    >
                      {countryCodes.map((country) => (
                        <MenuItem
                          key={country.code}
                          value={country.code}
                          style={{
                            fontFamily: "Bricolage Grotesque",
                            fontSize: "14px",
                          }}
                        >
                          <div className="flex items-center">
                            {country.flag && (
                              <img
                                src={country.flag}
                                alt={country.name}
                                className="w-5 h-3 mr-2"
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
                    size="small"
                    error={
                      formData.phone.length > 0 && !isPhoneValid(formData.phone)
                    }
                    helperText={
                      formData.phone.length > 0 && !isPhoneValid(formData.phone)
                        ? "Please enter a valid 10-digit number"
                        : ""
                    }
                    placeholder="Enter your name"
                    inputProps={{
                      maxLength: 10,
                      style: {
                        fontFamily: "Bricolage Grotesque",
                        fontSize: "14px",
                        padding: "10px 14px",
                      },
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px" } }}
                  />
                </div>
              </div>

              {/* License */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Do You Have A 4W Driver's License?
                </label>
                <RadioGroup
                  row
                  name="license"
                  value={formData.license}
                  onChange={handleChange}
                >
                  <FormControlLabel
                    value="yes"
                    control={
                      <Radio
                        size="small"
                        sx={{
                          color: "#00CE84",
                          "&.Mui-checked": { color: "#00CE84" },
                        }}
                      />
                    }
                    label={
                      <Typography
                        style={{
                          fontFamily: "Bricolage Grotesque",
                          fontSize: "14px",
                          color: "#4B5563",
                        }}
                      >
                        Yes
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    value="no"
                    control={
                      <Radio
                        size="small"
                        sx={{
                          color: "#00CE84",
                          "&.Mui-checked": { color: "#00CE84" },
                        }}
                      />
                    }
                    label={
                      <Typography
                        style={{
                          fontFamily: "Bricolage Grotesque",
                          fontSize: "14px",
                          color: "#4B5563",
                        }}
                      >
                        No
                      </Typography>
                    }
                  />
                </RadioGroup>
              </div>

              {/* Locality */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Which Locality Are You Based Out Of?
                </label>
                <div className="bg-white">
                  <APIProvider
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                    libraries={["places"]}
                  >
                    <LocationSelector
                      formData={formData}
                      setFormData={setFormData}
                    />
                  </APIProvider>
                </div>
              </div>

              {/* Terms */}
              <p className="text-xs text-gray-500 text-center leading-relaxed mt-2">
                By continuing, you agree to our{" "}
                <a
                  href="https://inlane.in/terms-and-conditions"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-gray-800"
                >
                  Terms of Service
                </a>{" "}
                &{" "}
                <a
                  href="https://inlane.in/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-gray-800"
                >
                  Privacy Policy
                </a>
              </p>

              {/* Submit */}
              <div className="flex justify-center mt-2 pb-2">
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting}
                  startIcon={
                    isSubmitting ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : null
                  }
                  sx={{
                    background: isSubmitting
                      ? "rgba(0,206,132,0.7)"
                      : "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                    color: "white",
                    fontWeight: "700",
                    fontFamily: "Bricolage Grotesque",
                    textTransform: "none",
                    "&:hover": {
                      background:
                        "linear-gradient(90deg, #00BC78 0%, #00CE84 100%)",
                    },
                    "&:disabled": { color: "white", cursor: "not-allowed" },
                    borderRadius: "50px",
                    padding: "10px 32px",
                    fontSize: "1rem",
                    boxShadow: "0 4px 10px rgba(0,206,132,0.3)",
                    minWidth: "150px",
                  }}
                >
                  {isSubmitting ? "Submitting" : "Sign Up 🚀"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default SignupPopup;
