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

// Fetch country codes
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

function getOrCreateClientId() {
    const key = "custom_client_id";
    let clientId = localStorage.getItem(key);
    if (!clientId) {
        clientId = crypto.randomUUID();
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
        return () => { isMounted = false; };
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

    const handleSubmit = useCallback(async (e) => {
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

        // Debug: Log UTM params at submission time
        console.log('🔍 DEBUG: utmParams at form submission:');
        console.log('🔍 DEBUG: utm_source: website, utm_medium: popup, utm_campaign: signup_popup, utm_content: homepage_popup');

        try {
            const googleSheetsUrl =
                "https://script.google.com/macros/s/AKfycbz45poihO1GSt_f-UxHHWltKWHh8mDNyaXPcFzbIURMvTVKj1qPn9STBILUaMiGme7r/exec";

            // UTM params matching the popup signup URL
            const utmParams = {
                utm_source: "website",
                utm_medium: "popup",
                utm_campaign: "signup_popup",
                utm_content: "homepage_popup",
            };

            console.log('📤 Submitting form with UTM parameters:', utmParams);

            const payload = {
                email: formData.email,
                name: formData.name,
                phone: `${formData.countryCode}${formData.phone}`,
                license: formData.license === "yes" ? "yes" : "no",
                locality: `${formData?.city?.label || ""}, ${formData?.area?.label || ""}`,
                adName: "Popup Signup Form",
                leadSource: `Website-${utmParams.utm_source}`,
            };

            console.log('📊 Google Sheets Payload:', payload);

            // Cratio payload mirrors Signup.jsx: spread utmParams first, then payload fields
            const cratioPayload = {
                ...utmParams,
                ...payload,
                timestamp: new Date().toISOString(),
            };

            console.log('🎯 Cratio Webhook Payload (includes all UTM params):', cratioPayload);

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
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify(cratioPayload),
                }),
            ]);

            if (cratioResponse.type === 'opaque') {
                console.log('✅ Cratio webhook request sent successfully');
            }

            console.log('✅ Popup form submission completed successfully');

            // GA event (non-blocking)
            try {
                await supabase.functions.invoke("ga-event-manager", {
                    body: {
                        eventSource: "popup_signup",
                        clientId: getOrCreateClientId(),
                        leadData: { phone: formData.phone },
                    },
                });
            } catch (_) { }

            localStorage.setItem("popup_show_count", "2"); // Mark as fully done — never show again
            handleClose();
            window.location.href = '/thank-you';
        } catch (error) {
            console.error('❌ Popup submission error:', error);
            alert("Submission might have failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, isSubmitting, isPhoneValid]);

    if (!isVisible) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[999] backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-4 overflow-y-auto">
                <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm my-auto">

                    {/* Green Header */}
                    <div className="bg-[#00CE84] px-5 pt-5 pb-4 flex flex-col items-center text-center relative rounded-t-3xl">
                        <button
                            onClick={handleClose}
                            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors text-white font-bold text-sm"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                        <img src="/LANE_LOGO.svg" alt="InLane" className="h-7 mb-2" />
                        <h2 className="text-base font-extrabold text-white">
                            Start Your Driving Journey! 🚗
                        </h2>
                        <p className="text-white/90 mt-0.5 text-xs">
                            Fill in your details and we'll get you started.
                        </p>
                    </div>

                    {/* Curve divider */}
                    <div className="bg-[#00CE84]">
                        <div className="bg-white rounded-t-[2rem] h-4" />
                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleSubmit}
                        className="bg-white px-4 pb-4 rounded-b-3xl space-y-2.5 font-['Bricolage_Grotesque']"
                    >
                        {/* Email */}
                        <div className="rounded-xl p-3 bg-[#D1B3FF]">
                            <label className="block text-xs font-bold mb-1">Your Email ID</label>
                            <TextField
                                fullWidth
                                variant="outlined"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                placeholder="Enter your email"
                                size="small"
                                inputProps={{ style: { fontFamily: "Bricolage Grotesque", fontSize: "13px" } }}
                            />
                        </div>

                        {/* Name */}
                        <div className="rounded-xl p-3 bg-[#D9FF7A]">
                            <label className="block text-xs font-bold mb-1">Your Name</label>
                            <TextField
                                fullWidth
                                variant="outlined"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                placeholder="Enter your name"
                                size="small"
                                inputProps={{ style: { fontFamily: "Bricolage Grotesque", fontSize: "13px" } }}
                            />
                        </div>

                        {/* Phone */}
                        <div className="rounded-xl p-3 bg-[#00CE84]">
                            <label className="block text-xs font-bold mb-1">Your Phone Number</label>
                            <div className="flex gap-2">
                                <FormControl className="w-28">
                                    <Select
                                        value={formData.countryCode}
                                        name="countryCode"
                                        onChange={handleChange}
                                        size="small"
                                        className="w-28"
                                        renderValue={(selected) => {
                                            const country = countryCodes.find((c) => c.code === selected);
                                            return (
                                                <div className="flex items-center">
                                                    {country?.flag && (
                                                        <img src={country.flag} alt={country.name} className="w-5 h-3 mr-1" />
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
                                                        <img src={country.flag} alt={country.name} className="w-5 h-3 mr-2" />
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
                                    error={formData.phone.length > 0 && !isPhoneValid(formData.phone)}
                                    helperText={
                                        formData.phone.length > 0 && !isPhoneValid(formData.phone)
                                            ? "Please enter a valid 10-digit number"
                                            : ""
                                    }
                                    placeholder="Enter phone number"
                                    inputProps={{ maxLength: 10, style: { fontFamily: "Bricolage Grotesque" } }}
                                />
                            </div>
                        </div>

                        {/* License */}
                        <div className="rounded-xl p-3 bg-[#D1B3FF]">
                            <label className="block text-xs font-bold mb-1">
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
                                    control={<Radio size="small" />}
                                    label={<Typography style={{ fontFamily: "Bricolage Grotesque", fontSize: "14px" }}>Yes</Typography>}
                                />
                                <FormControlLabel
                                    value="no"
                                    control={<Radio size="small" />}
                                    label={<Typography style={{ fontFamily: "Bricolage Grotesque", fontSize: "14px" }}>No</Typography>}
                                />
                            </RadioGroup>
                        </div>

                        {/* Locality */}
                        <div className="rounded-xl p-3 bg-[#D9FF7A]">
                            <label className="block text-xs font-bold mb-1">
                                Which Locality Are You Based Out Of?
                            </label>
                            <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} libraries={["places"]}>
                                <LocationSelector formData={formData} setFormData={setFormData} />
                            </APIProvider>
                        </div>

                        {/* Terms */}
                        <p className="text-xs text-gray-500 text-center">
                            By continuing, you agree to our{" "}
                            <a href="https://inlane.in/terms-and-conditions" target="_blank" rel="noreferrer" className="underline">
                                Terms of Service
                            </a>{" "}
                            &{" "}
                            <a href="https://inlane.in/privacy-policy" target="_blank" rel="noreferrer" className="underline">
                                Privacy Policy
                            </a>
                        </p>

                        {/* Submit */}
                        <div className="flex justify-center">
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={isSubmitting}
                                startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : null}
                                sx={{
                                    background: isSubmitting
                                        ? "rgba(0,206,132,0.7)"
                                        : "linear-gradient(90deg, #00CE84 0%, #00BC78 100%)",
                                    color: "white",
                                    fontWeight: "bold",
                                    fontFamily: "Bricolage Grotesque",
                                    textTransform: "none",
                                    "&:hover": { background: "linear-gradient(90deg, #00BC78 0%, #00CE84 100%)" },
                                    "&:disabled": { color: "white", cursor: "not-allowed" },
                                    border: "2px solid #FFFFFF",
                                    borderRadius: "50px",
                                    padding: "10px 40px",
                                    fontSize: "1rem",
                                    boxShadow: "2px 4px 4px rgba(0,0,0,0.2)",
                                    width: "100%",
                                }}
                            >
                                {isSubmitting ? "Submitting..." : "Sign Up 🚀"}
                            </Button>
                        </div>

                        {/* Dismiss */}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                            >
                                No thanks, I'll explore first
                            </button>
                        </div>


                    </form>

                </div>
            </div>
        </>
    );
};

export default SignupPopup;
